// The market every figure is computed in: a fixed valuation date, so the
// data, the tests and the screenshots stay the same from day to day, and
// the key rate on that date. All issues are fictional.
import { LDV_YEARS, addYears, dayOffset, parseIsoDate, type Market } from "@tyche/yield-twin";

export const VALUATION_DATE = "2026-09-04";
export const KEY_RATE_PCT = 16;

export const MARKET: Market = { valuationDate: VALUATION_DATE, keyRatePct: KEY_RATE_PCT };

const DAY_MS = 86_400_000;
const [y, m, d] = VALUATION_DATE.split("-").map(Number) as [number, number, number];
/** Midnight UTC of the valuation date, in milliseconds since the epoch. */
export const VALUATION_MS = Date.UTC(y, m - 1, d);

/** A day offset from the valuation date as milliseconds since the epoch
 * (midnight UTC), for Intl and Stoa's charts. */
export function dayToMs(day: number): number {
  return VALUATION_MS + day * DAY_MS;
}

/** The day offset of a YYYY-MM-DD date. */
export function dayOf(iso: string): number {
  return dayOffset(VALUATION_DATE, iso)!;
}

/** The revision of the Tax Code the engine's tax rules follow: in force
 * from this date. */
export const TAX_RULES_DAY = dayOf("2026-10-01");
/** The last day an individual investment account of type B could be
 * opened. */
export const IIS_B_LAST_OPEN_DAY = dayOf("2023-12-31");
/** The first horizon at which bonds bought on the valuation date are held
 * more than three years, by calendar anniversary: the day after it. */
export const LDV_FIRST_DAY = (() => {
  const today = parseIsoDate(VALUATION_DATE)!;
  return addYears(today, LDV_YEARS) - today + 1;
})();

/** A day offset from the valuation date as YYYY-MM-DD. */
export function dayToIso(day: number): string {
  return new Date(dayToMs(day)).toISOString().slice(0, 10);
}
