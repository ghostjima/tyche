import { describe, expect, it } from "vitest";
import { derive_bond } from "@tyche/yield-twin";
import { BONDS, generateBonds } from "./issues";
import { MARKET } from "./market";

describe("generated issues", () => {
  it("sixty issues with unique tickers, the same on every run", () => {
    expect(BONDS).toHaveLength(60);
    expect(new Set(BONDS.map((b) => b.id)).size).toBe(60);
    expect(generateBonds()).toEqual(BONDS);
  });

  it("every kind the screen shows is there", () => {
    const count = (f: (b: (typeof BONDS)[number]) => boolean) => BONDS.filter(f).length;
    expect(count((b) => b.issuer.kind === "ofz")).toBe(10);
    expect(count((b) => b.issue.couponType === "floater")).toBeGreaterThanOrEqual(6);
    expect(count((b) => b.issue.amortization.length > 0)).toBeGreaterThanOrEqual(6);
    expect(count((b) => b.issue.offers.length > 0)).toBeGreaterThanOrEqual(6);
  });

  it("every issue derives, with a yield to maturity between 5 and 40 percent", () => {
    for (const b of BONDS) {
      const r = derive_bond(b.issue, MARKET);
      if (!("ok" in r)) throw new Error(`${b.id}: ${r.error}`);
      expect(r.ok.ytmMaturity, b.id).toBeGreaterThan(0.05);
      expect(r.ok.ytmMaturity, b.id).toBeLessThan(0.4);
    }
  });
});
