// Coupon income per month over the next twelve months, from the holdings'
// events: what the "Monthly income" goal is about. Coupons and principal
// returned as the issues' terms schedule them, before tax; a floater's or
// a linker's coupons projected at today's index; a payment the synthetic
// scenario misses is not in the events, and one it makes late is not
// counted in a month.
import type { HoldingEvent } from "../data/events";

export type MonthIncome = {
  /** Year and month, 1 to 12. */
  year: number;
  month: number;
  coupons: number;
  principal: number;
  /** Whether a coupon in the month is projected. */
  projected: boolean;
};

/** The twelve calendar months from the valuation date's month, with the
 * coupons and principal of every holding paid in each, days 1 to 365
 * after the valuation date. */
export function monthlyIncome(valuationDate: string, events: readonly HoldingEvent[][]): MonthIncome[] {
  const [y0, m0] = valuationDate.split("-").map(Number) as [number, number];
  const months: MonthIncome[] = Array.from({ length: 12 }, (_, i) => {
    const k = m0 - 1 + i;
    return { year: y0 + Math.floor(k / 12), month: (k % 12) + 1, coupons: 0, principal: 0, projected: false };
  });
  for (const list of events) {
    for (const e of list) {
      if (e.day < 1 || e.day > 365 || e.source !== "terms") continue;
      const [y, m] = e.date.split("-").map(Number) as [number, number];
      const slot = months.find((x) => x.year === y && x.month === m);
      if (!slot) continue;
      if (e.kind === "coupon") {
        slot.coupons += e.amount;
        slot.projected ||= e.projected;
      } else if (e.kind === "amortisation" || e.kind === "maturity") slot.principal += e.amount;
    }
  }
  return months;
}
