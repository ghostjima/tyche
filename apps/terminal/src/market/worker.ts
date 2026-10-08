// The synthetic market's worker: loads tyche-market's WebAssembly, builds
// the universe once for the seed and the Bank of Russia figures it is
// sent, and answers with its JSON, so the page's thread never waits on
// the generator, with who may buy each issue and the placements by
// book-building. It keeps the universe, and answers for the events of
// holdings of it.
import init, { SynthMarket } from "tyche-market";
import type { MacroInputs } from "../data/issues";

/** A holding: an issue by its place in the universe, and the bonds held. */
export type HeldIssue = { index: number; bonds: number };

export type Request = { id: number; seed: number; inputs: MacroInputs } | { id: number; events: HeldIssue[] };
export type Response = { id: number; json: string; digest: string; access: string; placements: string } | { id: number; events: string[] } | { id: number; error: string };

let market: Promise<typeof SynthMarket> | null = null;
/** The universe built last. */
let built: SynthMarket | null = null;

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  const { id } = request;
  try {
    if ("events" in request) {
      if (!built) throw new Error("no_universe");
      const m = built;
      self.postMessage({ id, events: request.events.map((h) => m.eventsJson(h.index, h.bonds)) } satisfies Response);
      return;
    }
    market ??= init().then(() => SynthMarket);
    const Market = await market;
    const { seed, inputs } = request;
    const m = new Market(seed, inputs.valuationDate, inputs.keyRatePct, inputs.ruoniaPct, inputs.inflationPct, Float64Array.from(inputs.curve.termsYears), Float64Array.from(inputs.curve.yieldsPct));
    built?.free();
    built = m;
    const reply: Response = { id, json: m.universeJson(), digest: m.digest(), access: m.accessJson(), placements: m.placementsJson() };
    self.postMessage(reply);
  } catch (e) {
    // Forgotten, so the next request loads again.
    market = null;
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies Response);
  }
};
