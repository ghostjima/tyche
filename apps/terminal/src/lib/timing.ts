// Times derive_bond and calculate on one engine. The browser's clock is
// coarse (a tenth of a millisecond in a page that is not cross-origin
// isolated), and one call takes less than that, so each sample is the
// mean of a batch of calls; the median and the 95th percentile are taken
// over the samples, after warm-up batches that are not kept.
import type { Engine, Issue, Market, Plan } from "../engine/types";
import { median, percentile } from "./stats";

export const SAMPLES = 200;
export const BATCH = 10;
export const WARMUP = 20;
export const PERCENTILE = 95;

export type Timing = { median: number; p95: number };
export type EngineTiming = { derive: Timing; calculate: Timing };

function sample(run: () => void, samples: number, batch: number, warmup: number): Timing {
  for (let i = 0; i < warmup * batch; i++) run();
  const out: number[] = [];
  for (let s = 0; s < samples; s++) {
    const t0 = performance.now();
    for (let i = 0; i < batch; i++) run();
    out.push((performance.now() - t0) / batch);
  }
  return { median: median(out), p95: percentile(out, PERCENTILE) };
}

export function timeEngine(engine: Engine, issue: Issue, market: Market, plan: Plan, feePct: number, samples = SAMPLES, batch = BATCH): EngineTiming {
  return {
    derive: sample(() => engine.derive_bond(issue, market), samples, batch, WARMUP),
    calculate: sample(() => engine.calculate(issue, market, plan, feePct), samples, batch, WARMUP),
  };
}

/** Runs `fn` once and returns its result with the time it took, in
 * milliseconds. */
export function timed<T>(fn: () => T): [T, number] {
  const t0 = performance.now();
  const out = fn();
  return [out, performance.now() - t0];
}
