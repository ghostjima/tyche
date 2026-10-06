// The synthetic market's worker: loads tyche-market's WebAssembly, builds
// the universe once for the seed and the Bank of Russia figures it is
// sent, and answers with its JSON, so the page's thread never waits on
// the generator.
import init, { SynthMarket } from "tyche-market";
import type { MacroInputs } from "../data/issues";

export type Request = { id: number; seed: number; inputs: MacroInputs };
export type Response = { id: number; json: string; digest: string } | { id: number; error: string };

let market: Promise<typeof SynthMarket> | null = null;

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, seed, inputs } = event.data;
  try {
    market ??= init().then(() => SynthMarket);
    const Market = await market;
    const m = new Market(seed, inputs.valuationDate, inputs.keyRatePct, inputs.ruoniaPct, inputs.inflationPct, Float64Array.from(inputs.curve.termsYears), Float64Array.from(inputs.curve.yieldsPct));
    const reply: Response = { id, json: m.universeJson(), digest: m.digest() };
    m.free();
    self.postMessage(reply);
  } catch (e) {
    // Forgotten, so the next request loads again.
    market = null;
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies Response);
  }
};
