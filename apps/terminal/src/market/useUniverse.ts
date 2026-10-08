// The universe for the app: asks the market worker to generate it, once
// per page (a retry asks again), and parses its JSON. The time it took is
// left on the performance timeline as the measure "tyche:universe".
import { useCallback, useEffect, useState } from "react";
import { MACRO, SEED } from "../data/market";
import { parseGates, type Gates } from "../data/gates";
import { parseAccess, parseUniverse, type Access, type Universe } from "../data/issues";
import { parsePlacements, type Placement } from "../data/placements";
import type { Request, Response } from "./worker";

export type UniverseState =
  | { status: "loading" }
  | { status: "ready"; universe: Universe; access: Map<string, Access>; gates: Gates; placements: Placement[] }
  | { status: "failed"; error: string };

let worker: Worker | null = null;
let pending: Promise<UniverseState> | null = null;
let next = 0;

function request(): Promise<UniverseState> {
  pending ??= new Promise<UniverseState>((resolve) => {
    performance.mark("tyche:universe-start");
    worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const w = worker;
    const id = ++next;
    const fail = (error: string) => {
      // Forgotten, so a retry starts a new worker.
      pending = null;
      w.terminate();
      if (worker === w) worker = null;
      resolve({ status: "failed", error });
    };
    w.onerror = (e) => fail(e.message || "worker_error");
    w.onmessage = (event: MessageEvent<Response>) => {
      const r = event.data;
      if (r.id !== id) return;
      if ("error" in r) return fail(r.error);
      if (!("json" in r)) return fail("unexpected_reply");
      try {
        const universe = parseUniverse(r.json);
        const access = parseAccess(r.access);
        const gates = parseGates(r.access);
        const placements = parsePlacements(r.placements);
        performance.measure("tyche:universe", "tyche:universe-start");
        resolve({ status: "ready", universe, access, gates, placements });
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    };
    w.postMessage({ id, seed: SEED, inputs: MACRO } satisfies Request);
  });
  return pending;
}

/** The worker that holds the universe, once it is built; the events of
 * holdings are asked of it. */
export function universeWorker(): Worker | null {
  return worker;
}

/** A request id no other request of this page has. */
export function nextRequestId(): number {
  return ++next;
}

export function useUniverse(): { state: UniverseState; retry: () => void } {
  const [state, setState] = useState<UniverseState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void request().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  }, []);
  return { state, retry };
}
