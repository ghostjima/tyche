import { describe, expect, it } from "vitest";
import { ratingIndex } from "../data/issues";
import { MACRO, MARKET } from "../data/market";
import { BONDS } from "../data/universe.testing";
import { twinEngine } from "../engine/twin";
import type { Item } from "./filters";
import { ANALOGUE_MAX, analogues, curveAt, gSpread } from "./peers";

const items: Item[] = BONDS.map((bond) => {
  const r = twinEngine.derive_bond(bond.issue, MARKET);
  if (!("ok" in r)) throw new Error(bond.id);
  return { bond, derived: r.ok };
});
const item = (id: string) => items.find((i) => i.bond.id === id)!;

describe("the G-spread", () => {
  it("reads the curve linearly between its terms and flat beyond them", () => {
    const { termsYears: t, yieldsPct: y } = MACRO.curve;
    expect(curveAt(t[0]! / 2)).toBe(y[0]);
    expect(curveAt(t[1]!)).toBe(y[1]);
    expect(curveAt((t[1]! + t[2]!) / 2)).toBeCloseTo((y[1]! + y[2]!) / 2, 12);
    expect(curveAt(100)).toBe(y[y.length - 1]);
    const curve = { termsYears: [1, 2], yieldsPct: [10, 12] };
    expect(curveAt(1.25, curve)).toBe(10.5);
  });

  it("finds back the spread the synthetic market priced a government bond at, give or take the price step", () => {
    // The market prices a synthetic government bond at the curve at its
    // duration plus a spread drawn between -10 and +20 basis points.
    const gov = items.filter((i) => i.bond.issuer.kind === "government" && i.bond.coupon.kind !== "linker");
    expect(gov.length).toBeGreaterThan(20);
    for (const i of gov) {
      const g = gSpread(twinEngine, i)!;
      expect(g.spreadBp, i.bond.id).toBeGreaterThan(-12);
      expect(g.spreadBp, i.bond.id).toBeLessThan(22);
      expect(g.curvePct).toBe(curveAt(g.durationYears));
    }
  });

  it("widens down the rating scale, and is left out for an inflation-linked issue", () => {
    const mean = (f: (i: Item) => boolean) => {
      const xs = items.filter((i) => f(i) && i.bond.coupon.kind !== "linker").map((i) => gSpread(twinEngine, i)!.spreadBp);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(mean((i) => ratingIndex(i.bond.rating) <= 3)).toBeLessThan(mean((i) => ratingIndex(i.bond.rating) >= 7 && ratingIndex(i.bond.rating) <= 9));
    expect(mean((i) => ratingIndex(i.bond.rating) >= 7 && ratingIndex(i.bond.rating) <= 9)).toBeLessThan(mean((i) => ratingIndex(i.bond.rating) >= 10));
    const linker = items.find((i) => i.bond.coupon.kind === "linker")!;
    expect(gSpread(twinEngine, linker)).toBeNull();
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
