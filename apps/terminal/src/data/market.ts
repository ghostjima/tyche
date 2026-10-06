// The market every figure is computed in: a fixed valuation date, so the
// data, the tests and the screenshots stay the same from day to day, and
// the Bank of Russia's figures for it, from which the synthetic universe
// is generated. All issues are fictional.
import { LDV_YEARS, addYears, dayOffset, parseIsoDate, type Curve, type Market } from "@tyche/yield-twin";
import type { MacroInputs } from "./issues";
import SNAPSHOT from "../../../../data/cbr/snapshot.json";

export { SNAPSHOT };

/** The Bank of Russia figures of the snapshot this build carries (taken
 * by scripts/cbr-snapshot.mjs, with every figure's source URL and
 * retrieval time in the file): the key rate, RUONIA and the zero-coupon
 * yield curve of federal loan bonds (calculated by the Moscow Exchange)
 * on the curve's latest date, which is the valuation date, and inflation
 * over twelve months to the latest month (Rosstat and the Bank of
 * Russia). */
export const MACRO: MacroInputs = {
  valuationDate: SNAPSHOT.latest.date,
  keyRatePct: SNAPSHOT.latest.keyRatePct,
  ruoniaPct: SNAPSHOT.latest.ruoniaPct,
  inflationPct: SNAPSHOT.latest.inflationPct,
  curve: { termsYears: [...SNAPSHOT.latest.curve.termsYears], yieldsPct: [...SNAPSHOT.latest.curve.yieldsPct] },
};

/** The seed of the universe: the same issues for every visitor. */
export const SEED = 20_261_006;

export const VALUATION_DATE = MACRO.valuationDate;
export const KEY_RATE_PCT = MACRO.keyRatePct;

export const MARKET: Market = { valuationDate: VALUATION_DATE, keyRatePct: KEY_RATE_PCT };

/** The zero-coupon yield curve of federal loan bonds on the valuation
 * date, as the snapshot holds it: yields in percent a year, annual
 * effective, at the published terms in years. The engine takes it for the
 * G-spreads. */
export const CURVE: Curve = MACRO.curve;

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
