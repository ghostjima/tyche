// Numbers, money and dates in the interface's locale. Money, percents and
// signed values are Stoa's formatters (useFormatters), which write a
// negative with the minus sign (U+2212) and keep a value on one line; this
// module adds what is the app's own: dates as day offsets from the
// valuation date, written in UTC so the day is the same everywhere, months,
// terms in years and months, durations in years, and plain numbers.
import { stoaFormatters, useFormatters, type StoaFormatters } from "@ghostjima/stoa-react";
import { dayToMs } from "../data/market";

/** Dates and times in UTC: the valuation date is a calendar day, not an
 * instant in the viewer's zone. */
const ZONE = { timeZone: "UTC" } as const;

export type Formats = StoaFormatters & {
  /** A day offset from the valuation date as a date ("Sep 4, 2026"). */
  day(day: number): string;
  /** A month, "YYYY-MM", as the month and the year ("August 2026"). */
  month(iso: string): string;
  /** A count of days as years and months ("2 years 5 months"); under a
   * month as days. */
  term(days: number): string;
  /** Years with two decimals ("2.35 years"), for durations. */
  years(value: number): string;
  /** A number with a fixed count of decimals. */
  decimal(value: number, digits: number): string;
  integer(value: number): string;
};

const cache = new WeakMap<StoaFormatters, Formats>();

/** Stoa's formatters for a locale with the app's own added. */
export function appFormats(stoa: StoaFormatters): Formats {
  const hit = cache.get(stoa);
  if (hit) return hit;
  const { locale } = stoa;
  const numbers = new Map<string, Intl.NumberFormat>();
  const number = (key: string, options: Intl.NumberFormatOptions) => {
    let f = numbers.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, options);
      numbers.set(key, f);
    }
    return f;
  };
  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", ...ZONE });
  const unit = (u: "year" | "month" | "day") => number(`unit-${u}`, { style: "unit", unit: u, unitDisplay: "long" });
  const list = new Intl.ListFormat(locale, { type: "unit", style: "long" });
  const f: Formats = {
    ...stoa,
    day: (day) => stoa.date(dayToMs(day)),
    month: (iso) => {
      const [y, m] = iso.split("-").map(Number) as [number, number];
      return month.format(Date.UTC(y, m - 1, 1));
    },
    term: (days) => {
      if (days < 30) return unit("day").format(Math.max(0, Math.round(days)));
      const months = Math.round(days / (365 / 12));
      const y = Math.floor(months / 12);
      const m = months % 12;
      const parts: string[] = [];
      if (y > 0) parts.push(unit("year").format(y));
      if (m > 0 || y === 0) parts.push(unit("month").format(m));
      return list.format(parts);
    },
    years: (v) => number("years", { style: "unit", unit: "year", unitDisplay: "long", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v),
    decimal: (v, digits) => number(`dec-${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
    integer: (v) => number("int", { maximumFractionDigits: 0 }).format(v),
  };
  cache.set(stoa, f);
  return f;
}

/** The formats for a locale, outside React (tests). */
export const formats = (locale: string): Formats => appFormats(stoaFormatters(locale, ZONE));

/** The formats for the locale of the I18nProvider above. */
export function useAppFormats(): Formats {
  return appFormats(useFormatters(ZONE));
}
