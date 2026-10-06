// A floater's coupon resets over the past year, rebuilt from the Bank of
// Russia's figures in the snapshot: at the start of each coupon period the
// coupon is set to the index (the key rate, or RUONIA) on that day plus
// the issue's spread. The issue is fictional, so these are the coupons it
// would have paid; the index values are the Bank of Russia's.
import type { Bond } from "../data/issues";
import { SNAPSHOT, dayToIso } from "../data/market";

export type Reset = {
  /** The day the period starts, as an offset from the valuation date
   * (zero or negative). */
  day: number;
  /** The index on that day, percent a year. */
  indexPct: number;
  /** The issue's spread over the index, percent. */
  spreadPct: number;
  /** The coupon rate for the period: index plus spread, percent a year. */
  ratePct: number;
};

/** How far back the history goes, in days, and how many resets it shows
 * at most (half a year of a monthly coupon). */
export const RESET_HISTORY_DAYS = 365;
export const RESET_HISTORY_MAX = 6;

/** The key rate in force on a date (YYYY-MM-DD): the last change on or
 * before it; null before the first. */
export function keyRateOn(iso: string): number | null {
  let rate: number | null = null;
  for (const c of SNAPSHOT.keyRate.changes) {
    if (c.from <= iso) rate = c.pct;
    else break;
  }
  return rate;
}

/** RUONIA on a date: the last value published on or before it; null when
 * the snapshot does not go back that far. */
export function ruoniaOn(iso: string): number | null {
  if (iso < SNAPSHOT.ruonia.from) return null;
  let rate: number | null = null;
  for (const v of SNAPSHOT.ruonia.values) {
    if (v.date <= iso) rate = v.pct;
    else break;
  }
  return rate;
}

/** The resets of a floater from the current period back over
 * RESET_HISTORY_DAYS, RESET_HISTORY_MAX at most, latest first: the
 * current period starts a period before the next coupon. Empty for any
 * other coupon. */
export function couponResets(bond: Bond, nextCouponDay: number): Reset[] {
  const kind = bond.coupon.kind;
  if (kind !== "key_rate" && kind !== "ruonia") return [];
  const period = bond.issue.periodDays;
  const out: Reset[] = [];
  for (let day = nextCouponDay - period; day >= -RESET_HISTORY_DAYS && out.length < RESET_HISTORY_MAX; day -= period) {
    const iso = dayToIso(day);
    const index = kind === "key_rate" ? keyRateOn(iso) : ruoniaOn(iso);
    if (index === null) break;
    const spreadPct = bond.coupon.indexSpreadPct;
    out.push({ day, indexPct: index, spreadPct, ratePct: index + spreadPct });
  }
  return out;
}
