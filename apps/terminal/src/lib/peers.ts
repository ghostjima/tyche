// An issue among its peers: the G-spread to the Bank of Russia's
// zero-coupon yield curve of federal loan bonds at the issue's duration,
// as the engine works it out, and the analogues, issues of a similar
// rating and duration.
import { ratingIndex } from "../data/issues";
import { CURVE, MARKET } from "../data/market";
import type { Curve, Engine, GSpread, Result } from "../engine/types";
import type { Item } from "./filters";

/** The G-spread of an issue's yield to its nearest exit (the offer, else
 * maturity), from the engine against the snapshot's curve; null for an
 * inflation-linked issue, whose yield is real and does not compare with a
 * nominal curve; the engine's error code when it cannot read the
 * curve. */
export function gSpread(engine: Engine, { bond }: Item, curve: Curve = CURVE): Result<GSpread> | null {
  if (bond.coupon.kind === "linker") return null;
  const r = engine.g_spread(bond.issue, MARKET, curve);
  return "ok" in r ? { ok: r.ok.toOffer ?? r.ok.toMaturity } : r;
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
