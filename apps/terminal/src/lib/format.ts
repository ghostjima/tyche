// Numbers, money, dates and terms in the interface's locale, through Intl.
// Currency is the rouble, written with its sign in every language; dates
// are the valuation date plus a day offset, written in UTC so the day is
// the same everywhere.
import { dayToMs } from "../data/market";

export type Formats = {
  locale: string;
  /** Roubles with kopecks. */
  money(value: number): string;
  /** Roubles with kopecks and a sign, + for income and - for costs. */
  moneySigned(value: number): string;
  /** Whole roubles. */
  moneyWhole(value: number): string;
  /** A fraction as a percent (0.153 as 15.30%). */
  percent(fraction: number, digits?: number): string;
  /** A fraction as a signed percent. */
  percentSigned(fraction: number, digits?: number): string;
  /** A number with a fixed count of decimals. */
  decimal(value: number, digits: number): string;
  /** A signed number with a fixed count of decimals, for rate shifts. */
  decimalSigned(value: number, digits: number): string;
  integer(value: number): string;
  /** A day offset from the valuation date as a date ("4 Sep 2026"). */
  date(day: number): string;
  /** A month, "YYYY-MM", as the month and the year ("August 2026"). */
  month(iso: string): string;
  /** A count of days as years and months ("2 years 5 months"); under a
   * month as days. */
  term(days: number): string;
  /** Years with two decimals ("2.35 years"), for durations. */
  years(value: number): string;
};

const cache = new Map<string, Formats>();

export function formats(locale: string): Formats {
  const hit = cache.get(locale);
  if (hit) return hit;
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "RUB", currencyDisplay: "narrowSymbol" });
  const moneySigned = new Intl.NumberFormat(locale, { style: "currency", currency: "RUB", currencyDisplay: "narrowSymbol", signDisplay: "exceptZero" });
  const moneyWhole = new Intl.NumberFormat(locale, { style: "currency", currency: "RUB", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const numbers = new Map<string, Intl.NumberFormat>();
  const number = (key: string, options: Intl.NumberFormatOptions) => {
    let f = numbers.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, options);
      numbers.set(key, f);
    }
    return f;
  };
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const unit = (u: "year" | "month" | "day") => number(`unit-${u}`, { style: "unit", unit: u, unitDisplay: "long" });
  const list = new Intl.ListFormat(locale, { type: "unit", style: "long" });
  const f: Formats = {
    locale,
    money: (v) => money.format(v),
    moneySigned: (v) => moneySigned.format(v),
    moneyWhole: (v) => moneyWhole.format(v),
    percent: (v, digits = 2) => number(`pct-${digits}`, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
    percentSigned: (v, digits = 2) =>
      number(`pcts-${digits}`, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "exceptZero" }).format(v),
    decimal: (v, digits) => number(`dec-${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
    decimalSigned: (v, digits) => number(`decs-${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "exceptZero" }).format(v),
    integer: (v) => number("int", { maximumFractionDigits: 0 }).format(v),
    date: (day) => date.format(dayToMs(day)),
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
  };
  cache.set(locale, f);
  return f;
}
