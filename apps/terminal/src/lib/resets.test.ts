import { describe, expect, it } from "vitest";
import { MARKET, dayToIso } from "../data/market";
import { BONDS } from "../data/universe.testing";
import { twinEngine } from "../engine/twin";
import { RESET_HISTORY_DAYS, RESET_HISTORY_MAX, couponResets, keyRateOn, ruoniaOn } from "./resets";

const bond = (id: string) => BONDS.find((b) => b.id === id)!;
const nextCoupon = (id: string) => {
  const r = twinEngine.derive_bond(bond(id).issue, MARKET);
  if (!("ok" in r)) throw new Error(id);
  return r.ok.couponDays[0]!;
};

describe("coupon resets", () => {
  it("read the key rate in force on a day from the Bank of Russia's changes", () => {
    expect(keyRateOn("2026-10-05")).toBe(14);
    expect(keyRateOn("2026-07-27")).toBe(14);
    expect(keyRateOn("2026-07-26")).toBe(14.25);
    expect(keyRateOn("2013-09-16")).toBeNull();
  });

  it("read RUONIA on a day, the last value published by then, within the snapshot", () => {
    expect(ruoniaOn("2026-10-05")).toBe(13.77);
    // A Sunday takes Friday's value.
    expect(ruoniaOn("2026-10-04")).toBe(13.85);
    expect(ruoniaOn("2025-10-05")).toBeNull();
  });

  it("set a RUONIA floater's coupon at the index on each period's first day plus its spread, latest first", () => {
    const b = bond("LADE-02");
    const resets = couponResets(b, nextCoupon("LADE-02"));
    expect(resets).toHaveLength(RESET_HISTORY_MAX);
    expect(resets[0]!.day).toBe(nextCoupon("LADE-02") - b.issue.periodDays);
    expect(resets[0]!.day).toBeLessThanOrEqual(0);
    for (const [i, r] of resets.entries()) {
      expect(r.day).toBeGreaterThanOrEqual(-RESET_HISTORY_DAYS);
      if (i > 0) expect(r.day).toBe(resets[i - 1]!.day - b.issue.periodDays);
      expect(r.indexPct).toBe(ruoniaOn(dayToIso(r.day)));
      expect(r.spreadPct).toBe(b.coupon.indexSpreadPct);
      expect(r.ratePct).toBeCloseTo(r.indexPct + r.spreadPct, 10);
    }
  });

  it("use the key rate for a key-rate floater, and give nothing for a fixed coupon", () => {
    const resets = couponResets(bond("KUBL-01"), nextCoupon("KUBL-01"));
    expect(resets.length).toBeGreaterThan(0);
    for (const r of resets) expect(r.indexPct).toBe(keyRateOn(dayToIso(r.day)));
    expect(couponResets(bond("KAMF-01"), nextCoupon("KAMF-01"))).toEqual([]);
  });
});
