// The market every figure is computed in: a fixed valuation date, so the
// data, the tests and the screenshots stay the same from day to day, and
// the Bank of Russia's figures for it, from which the synthetic universe
// is generated. All issues are fictional.
import { LDV_YEARS, addYears, dayOffset, parseIsoDate, type Market } from "@tyche/yield-twin";
import type { MacroInputs } from "./issues";

/** As the Bank of Russia published them (cbr.ru, read on 2026-10-06): the
 * key rate on 2026-10-05, RUONIA for 2026-10-05, inflation over twelve
 * months to August 2026 (Rosstat and the Bank of Russia), and the
 * zero-coupon yield curve of federal loan bonds on 2026-10-05, which the
 * Moscow Exchange calculates. The same figures as tyche-market's
 * `inputs::fallback()`, which a unit test checks. */
export const MACRO: MacroInputs = {
  valuationDate: "2026-10-05",
  keyRatePct: 14,
  ruoniaPct: 13.77,
  inflationPct: 6.33,
  curve: {
    termsYears: [0.25, 0.5, 0.75, 1, 2, 3, 5, 7, 10, 15, 20, 30],
    yieldsPct: [10.91, 12.04, 12.91, 13.58, 15.13, 15.81, 16.37, 16.61, 16.8, 16.94, 17.01, 17.07],
  },
};

/** The seed of the universe: the same issues for every visitor. */
export const SEED = 20_261_006;

export const VALUATION_DATE = MACRO.valuationDate;
export const KEY_RATE_PCT = MACRO.keyRatePct;

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
