// An issue among its peers: the G-spread to the Bank of Russia's
// zero-coupon yield curve of federal loan bonds at the issue's duration,
// and the analogues, issues of a similar rating and duration.
import { ratingIndex } from "../data/issues";
import { MACRO } from "../data/market";
import type { Engine } from "../engine/types";
import type { Item } from "./filters";

/** The curve's yield at a term in years, percent: linear between the
 * published terms and flat beyond them, as the synthetic market reads it
 * when it prices an issue. */
export function curveAt(years: number, curve = MACRO.curve): number {
  const t = curve.termsYears;
  const y = curve.yieldsPct;
  if (t.length === 0) return Number.NaN;
  if (years <= t[0]!) return y[0]!;
  for (let i = 1; i < t.length; i++) {
    if (years <= t[i]!) {
      const w = (years - t[i - 1]!) / (t[i]! - t[i - 1]!);
      return y[i - 1]! + w * (y[i]! - y[i - 1]!);
    }
  }
  return y[y.length - 1]!;
}

export type GSpread = {
  /** Macaulay duration to the nearest exit (the offer, else maturity) at
   * the yield to it, years. */
  durationYears: number;
  /** The curve's yield at that duration, percent. */
  curvePct: number;
  /** The issue's yield to the same exit less the curve's, basis points. */
  spreadBp: number;
};

/** The G-spread of an issue, or null for an inflation-linked one, whose
 * yield is real and does not compare with a nominal curve. */
export function gSpread(engine: Engine, { bond, derived: d }: Item): GSpread | null {
  if (bond.coupon.kind === "linker") return null;
  const flows = d.flowsToOffer ?? d.flows;
  const amounts = flows.coupons.map((c, i) => c + (flows.principals[i] ?? 0));
  const durationYears = engine.macaulay_duration(amounts, flows.days, d.yieldEvent);
  const curvePct = curveAt(durationYears);
  return { durationYears, curvePct, spreadBp: (d.yieldEvent * 100 - curvePct) * 100 };
}

/** How close a peer's rating and duration must be to count as an
 * analogue: within a notch of the synthetic scale, within half a year of
 * Macaulay duration. */
export const ANALOGUE_NOTCHES = 1;
export const ANALOGUE_YEARS = 0.5;
/** How many analogues are shown, the closest first. */
export const ANALOGUE_MAX = 5;

/** The issues of a similar rating and duration, the closest first: by
 * notches apart plus years apart, then by ticker. */
export function analogues(item: Item, items: readonly Item[]): Item[] {
  const r = ratingIndex(item.bond.rating);
  const distance = (x: Item) => Math.abs(ratingIndex(x.bond.rating) - r) + Math.abs(x.derived.macaulay - item.derived.macaulay);
  return items
    .filter(
      (x) =>
        x.bond.id !== item.bond.id &&
        Math.abs(ratingIndex(x.bond.rating) - r) <= ANALOGUE_NOTCHES &&
        Math.abs(x.derived.macaulay - item.derived.macaulay) <= ANALOGUE_YEARS,
    )
    .sort((a, b) => distance(a) - distance(b) || (a.bond.id < b.bond.id ? -1 : 1))
    .slice(0, ANALOGUE_MAX);
}
