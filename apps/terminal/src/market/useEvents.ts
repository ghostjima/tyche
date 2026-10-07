// The events of the holdings, asked of the market worker that holds the
// universe, and parsed. Asked again whenever the holdings change.
import { useEffect, useState } from "react";
import { parseEvents, type HoldingEvent } from "../data/events";
import type { HeldIssue, Request, Response } from "./worker";
import { nextRequestId, universeWorker } from "./useUniverse";

export type EventsState = { status: "loading" } | { status: "ready"; events: HoldingEvent[][] } | { status: "failed"; error: string };

function ask(held: HeldIssue[]): Promise<EventsState> {
  const w = universeWorker();
  if (!w) return Promise.resolve({ status: "failed", error: "no_universe" });
  const id = nextRequestId();
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<Response>) => {
      const r = event.data;
      if (r.id !== id) return;
      w.removeEventListener("message", onMessage);
      if ("error" in r) return resolve({ status: "failed", error: r.error });
      if (!("events" in r)) return resolve({ status: "failed", error: "unexpected_reply" });
      try {
        resolve({ status: "ready", events: r.events.map(parseEvents) });
      } catch (e) {
        resolve({ status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, events: held } satisfies Request);
  });
}

/** The events of each holding, in the holdings' order; `ready` is false
 * until the universe is. */
export function useEvents(held: HeldIssue[], ready: boolean): EventsState {
  const [state, setState] = useState<EventsState>({ status: "loading" });
  const key = held.map((h) => `${h.index}*${h.bonds}`).join(",");
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setState({ status: "loading" });
    void ask(held).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
    // The holdings are rebuilt on every render; their key is what matters.
  }, [key, ready]);
  return state;
}
