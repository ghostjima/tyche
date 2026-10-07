import { describe, expect, it } from "vitest";
import type { HoldingEvent } from "../data/events";
import { monthlyIncome } from "./income";

const ev = (kind: HoldingEvent["kind"], day: number, date: string, amount: number, extra: Partial<HoldingEvent> = {}): HoldingEvent => ({
  kind,
  source: "terms",
  day,
  date,
  perBond: amount,
  amount,
  projected: false,
  windowFrom: null,
  windowTo: null,
  noticeDay: null,
  ratingFrom: null,
  ratingTo: null,
  ...extra,
});

describe("coupon income by month", () => {
  it("adds every holding's coupons and principal into the twelve months from the valuation month", () => {
    const months = monthlyIncome("2026-10-05", [
      [ev("coupon", 10, "2026-10-15", 100), ev("coupon", 40, "2026-11-14", 100, { projected: true }), ev("maturity", 40, "2026-11-14", 1000)],
      [ev("coupon", 20, "2026-10-25", 50), ev("amortisation", 300, "2027-08-01", 250)],
    ]);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2026, month: 10, coupons: 150, principal: 0, projected: false });
    expect(months[1]).toEqual({ year: 2026, month: 11, coupons: 100, principal: 1000, projected: true });
    expect(months[11]).toMatchObject({ year: 2027, month: 9 });
    expect(months[10]).toMatchObject({ year: 2027, month: 8, principal: 250 });
  });

  it("leaves out the past, what is beyond a year, the offers and the scenario's events", () => {
    const months = monthlyIncome("2026-10-05", [
      [
        ev("coupon", 0, "2026-10-05", 1),
        ev("coupon", 400, "2027-11-09", 1),
        ev("put_offer", 30, "2026-11-04", 1000),
        ev("default_cured", 50, "2026-11-24", 99, { source: "scenario" }),
        ev("technical_default", 45, "2026-11-19", 99, { source: "scenario" }),
      ],
    ]);
    expect(months.every((m) => m.coupons === 0 && m.principal === 0)).toBe(true);
  });
});
