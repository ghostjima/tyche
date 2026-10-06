// Loads the WebAssembly engine once, keeps the twin as the fallback, and
// remembers which one the viewer chose (?engine=twin in the URL; the
// WebAssembly engine otherwise). The load time is also left on the
// performance timeline as the measure "tyche:wasm-init", for the
// measurement script.
import { useCallback, useEffect, useState } from "react";
import { twinEngine } from "./twin";
import type { Engine, EngineKind } from "./types";
import { loadWasm } from "./wasm";

export type Engines =
  | { status: "loading" }
  | { status: "ready"; wasm: Engine | null; wasmMs: number | null; wasmError: string | null };

let pending: Promise<Engines> | null = null;

function load(): Promise<Engines> {
  pending ??= (async (): Promise<Engines> => {
    performance.mark("tyche:wasm-start");
    try {
      const { engine, ms } = await loadWasm();
      performance.measure("tyche:wasm-init", "tyche:wasm-start");
      return { status: "ready", wasm: engine, wasmMs: ms, wasmError: null };
    } catch (e) {
      // Forgotten, so a retry loads again.
      pending = null;
      return { status: "ready", wasm: null, wasmMs: null, wasmError: e instanceof Error ? e.message : String(e) };
    }
  })();
  return pending;
}

export function useEngines(): { engines: Engines; retry: () => void } {
  const [engines, setEngines] = useState<Engines>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void load().then((e) => {
      if (alive) setEngines(e);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);
  // A retry loads the WebAssembly again while the twin keeps the figures
  // on screen: the state stays as it is until the load settles, so the
  // screen does not go back to its loading state and back.
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { engines, retry };
}

const readChoice = (): EngineKind => (new URLSearchParams(location.search).get("engine") === "twin" ? "twin" : "wasm");

/** The viewer's engine choice, kept in ?engine=; the WebAssembly engine
 * is the default and leaves the URL clean. */
export function useEngineChoice(): [EngineKind, (kind: EngineKind) => void] {
  const [choice, setChoice] = useState<EngineKind>(readChoice);
  const set = useCallback((kind: EngineKind) => {
    const url = new URL(location.href);
    if (kind === "wasm") url.searchParams.delete("engine");
    else url.searchParams.set("engine", kind);
    history.replaceState(history.state, "", url);
    setChoice(kind);
  }, []);
  return [choice, set];
}

/** The engine that computes the figures: the chosen one, or the twin
 * while WebAssembly is not available. */
export function activeEngine(engines: Engines, choice: EngineKind): Engine | null {
  if (engines.status === "loading") return null;
  return choice === "wasm" && engines.wasm ? engines.wasm : twinEngine;
}
