import { describe, expect, it } from "vitest";
import { ratingIndex } from "../data/issues";
import { CURVE, MARKET } from "../data/market";
import { BONDS } from "../data/universe.testing";
import { twinEngine } from "../engine/twin";
import type { GSpread } from "../engine/types";
import type { Item } from "./filters";
import { ANALOGUE_MAX, analogues, gSpread } from "./peers";

const items: Item[] = BONDS.map((bond) => {
  const r = twinEngine.derive_bond(bond.issue, MARKET);
  if (!("ok" in r)) throw new Error(bond.id);
  return { bond, derived: r.ok };
});
const item = (id: string) => items.find((i) => i.bond.id === id)!;
const spread = (i: Item): GSpread => {
  const g = gSpread(twinEngine, i);
  if (g === null || "error" in g) throw new Error(i.bond.id);
  return g.ok;
};

describe("the G-spread", () => {
  it("is the engine's, to the nearest exit, against the snapshot's curve", () => {
    for (const i of items.filter((x) => x.bond.coupon.kind !== "linker")) {
      const g = spread(i);
      const r = twinEngine.g_spread(i.bond.issue, MARKET, CURVE);
      if (!("ok" in r)) throw new Error(r.error);
      expect(g).toEqual(r.ok.toOffer ?? r.ok.toMaturity);
      // The yield is the one to the nearest exit; the terms around the
      // duration are the snapshot's published ones.
      expect(g.yieldPct).toBeCloseTo(i.derived.yieldEvent * 100, 12);
      expect(CURVE.termsYears).toContain(g.termBelowYears);
      expect(CURVE.termsYears).toContain(g.termAboveYears);
      if (i.derived.offerDay === null) expect(g.durationYears).toBeCloseTo(i.derived.macaulay, 12);
    }
  });

  it("finds back the spread the synthetic market priced a government bond at, give or take the price step", () => {
    // The market prices a synthetic government bond at the curve at its
    // duration plus a spread drawn between -10 and +20 basis points.
    const gov = items.filter((i) => i.bond.issuer.kind === "government" && i.bond.coupon.kind !== "linker");
    expect(gov.length).toBeGreaterThan(20);
    for (const i of gov) {
      const g = spread(i);
      expect(g.spreadBp, i.bond.id).toBeGreaterThan(-12);
      expect(g.spreadBp, i.bond.id).toBeLessThan(22);
    }
  });

  it("widens down the rating scale, and is left out for an inflation-linked issue", () => {
    const mean = (f: (i: Item) => boolean) => {
      const xs = items.filter((i) => f(i) && i.bond.coupon.kind !== "linker").map((i) => spread(i).spreadBp);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(mean((i) => ratingIndex(i.bond.rating) <= 3)).toBeLessThan(mean((i) => ratingIndex(i.bond.rating) >= 7 && ratingIndex(i.bond.rating) <= 9));
    expect(mean((i) => ratingIndex(i.bond.rating) >= 7 && ratingIndex(i.bond.rating) <= 9)).toBeLessThan(mean((i) => ratingIndex(i.bond.rating) >= 10));
    const linker = items.find((i) => i.bond.coupon.kind === "linker")!;
    expect(gSpread(twinEngine, linker)).toBeNull();
  });

  it("passes on the engine's error for a curve it cannot read", () => {
    const fixed = items.find((i) => i.bond.coupon.kind === "fixed")!;
    expect(gSpread(twinEngine, fixed, { termsYears: [], yieldsPct: [] })).toEqual({ error: "curve_missing" });
    expect(gSpread(twinEngine, fixed, { termsYears: [2, 1], yieldsPct: [10, 11] })).toEqual({ error: "invalid_curve" });
  });
});

describe("analogues", () => {
  it("are within a notch and half a year of duration, the closest first, never the issue itself", () => {
    for (const id of ["KAMF-01", "BELB-02", "SG-143", "LADE-02"]) {
      const it_ = item(id);
      const found = analogues(it_, items);
      expect(found.length, id).toBeGreaterThan(0);
      expect(found.length).toBeLessThanOrEqual(ANALOGUE_MAX);
      const distance = (x: Item) => Math.abs(ratingIndex(x.bond.rating) - ratingIndex(it_.bond.rating)) + Math.abs(x.derived.macaulay - it_.derived.macaulay);
      for (const [k, a] of found.entries()) {
        expect(a.bond.id).not.toBe(id);
        expect(Math.abs(ratingIndex(a.bond.rating) - ratingIndex(it_.bond.rating))).toBeLessThanOrEqual(1);
        expect(Math.abs(a.derived.macaulay - it_.derived.macaulay)).toBeLessThanOrEqual(0.5);
        if (k > 0) expect(distance(a)).toBeGreaterThanOrEqual(distance(found[k - 1]!));
      }
    }
  });
});
