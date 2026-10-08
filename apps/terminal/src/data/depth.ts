// A depth check of a limit order against an issue's synthetic order book,
// as tyche-market writes it (depthJson): how much of the order the
// visible book fills at once at or better than the limit, at what average
// price, how far from the best opposite price, over how many price
// levels, and what is left. Prices cross the boundary in the book's
// units, 0.0001 percent of face value.

/** Book price units per percent of face value. */
export const UNITS_PER_PCT = 10_000;

/** The moment the book is read: the valuation date (day 0) at noon,
 * Moscow time, in the main session of every issue. The synthetic day is
 * the same on every visit. */
export const DEPTH_DAY = 0;
export const DEPTH_AT_MS = 12 * 3_600_000;

export type OrderSide = "buy" | "sell";

/** A check the worker runs: an issue by its place in the universe, the
 * order's side and bonds, and its limit in book units. */
export type DepthQuery = { index: number; side: OrderSide; bonds: number; limit: number };

/** What a check finds, prices in percent of face value. */
export type Depth = {
  requested: number;
  filled: number;
  left: number;
  /** The best opposite price before the order; null on an empty side. */
  bestPct: number | null;
  /** The size-weighted average fill price; null when nothing fills. */
  averagePct: number | null;
  worstPct: number | null;
  levelsUsed: number;
  /** Basis points of the best price the average is worse by; null when
   * nothing fills. */
  slippageBp: number | null;
  /** Each level taken, best first: its price and the bonds taken there. */
  fills: { pricePct: number; bonds: number }[];
};

/** A clean price in percent of face as book units: the limit the check
 * takes. A price on the issue's step is a whole number of units. */
export const pctToUnits = (pct: number): number => Math.round(pct * UNITS_PER_PCT);
const unitsToPct = (units: number): number => units / UNITS_PER_PCT;

type RawDepth = {
  requested: number;
  filled: number;
  left: number;
  best: number | null;
  average: number | null;
  worst: number | null;
  levelsUsed: number;
  slippageBp: number | null;
  fills: [number, number][];
};

/** Reads depthJson; throws on `null` (an index past the end, or a side the
 * market does not know). */
export function parseDepth(json: string): Depth {
  const raw = JSON.parse(json) as RawDepth | null;
  if (raw === null) throw new Error("no such issue or side");
  const pct = (x: number | null) => (x === null ? null : unitsToPct(x));
  return {
    requested: raw.requested,
    filled: raw.filled,
    left: raw.left,
    bestPct: pct(raw.best),
    averagePct: pct(raw.average),
    worstPct: pct(raw.worst),
    levelsUsed: raw.levelsUsed,
    slippageBp: raw.slippageBp,
    fills: raw.fills.map(([p, bonds]) => ({ pricePct: unitsToPct(p), bonds })),
  };
}
