// Depth checks of orders against the synthetic books, asked of the market
// worker that holds the universe, and parsed. Asked again whenever the
// checks change; an answer to an older set is dropped.
import { useEffect, useState } from "react";
import { parseDepth, type Depth, type DepthQuery } from "../data/depth";
import type { Request, Response } from "./worker";
import { nextRequestId, universeWorker } from "./useUniverse";

export type DepthState = { status: "loading" } | { status: "ready"; depth: Depth[] } | { status: "failed"; error: string };

function ask(queries: DepthQuery[]): Promise<DepthState> {
  const w = universeWorker();
  if (!w) return Promise.resolve({ status: "failed", error: "no_universe" });
  const id = nextRequestId();
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<Response>) => {
      const r = event.data;
      if (r.id !== id) return;
      w.removeEventListener("message", onMessage);
      if ("error" in r) return resolve({ status: "failed", error: r.error });
      if (!("depth" in r)) return resolve({ status: "failed", error: "unexpected_reply" });
      try {
        resolve({ status: "ready", depth: r.depth.map(parseDepth) });
      } catch (e) {
        resolve({ status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, depth: queries } satisfies Request);
  });
}

/** The checks' results, in the queries' order; `null` asks nothing and
 * stays loading. */
export function useDepth(queries: DepthQuery[] | null): DepthState {
  const [state, setState] = useState<DepthState>({ status: "loading" });
  const key = queries === null ? "" : JSON.stringify(queries);
  useEffect(() => {
    if (queries === null) {
      setState({ status: "loading" });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    void ask(queries).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
    // The queries are rebuilt on every render; their key is what matters.
  }, [key]);
  return state;
}
