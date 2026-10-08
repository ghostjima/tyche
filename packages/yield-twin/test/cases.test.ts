import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compare, decodeNaN } from "../../../crates/tyche-yield/node/compare.mjs";
import * as twin from "../src/index.js";
import type { Curve, HoldingYear, Issue, Market, Order, Plan } from "../src/index.js";

type Case = { name: string; fn: string; args: unknown[]; expect: unknown };

const cases = JSON.parse(readFileSync(new URL("../../../crates/tyche-yield/cases.json", import.meta.url), "utf8")) as Case[];

const n = (v: unknown) => v as number;
const a = (v: unknown) => v as number[];

function run(fn: string, args: unknown[]): unknown {
  const x = decodeNaN(args) as unknown[];
  switch (fn) {
    case "price_from_yield":
      return twin.price_from_yield(a(x[0]), a(x[1]), n(x[2]));
    case "ytm_effective":
      return twin.ytm_effective(a(x[0]), a(x[1]), n(x[2]));
    case "ytm_simple":
      return twin.ytm_simple(a(x[0]), a(x[1]), n(x[2]));
    case "accrued_interest":
      return twin.accrued_interest(n(x[0]), n(x[1]), n(x[2]));
    case "macaulay_duration":
      return twin.macaulay_duration(a(x[0]), a(x[1]), n(x[2]));
    case "modified_duration":
      return twin.modified_duration(a(x[0]), a(x[1]), n(x[2]));
    case "build_cash_flow":
      return twin.build_cash_flow(
        n(x[0]),
        n(x[1]),
        a(x[2]),
        a(x[3]),
        a(x[4]),
        a(x[5]),
        n(x[6]),
        n(x[7]),
        n(x[8]),
      );
    case "floater_rate_path":
      return twin.floater_rate_path(n(x[0]), n(x[1]), n(x[2]), n(x[3]));
    case "floater_coupons":
      return twin.floater_coupons(n(x[0]), n(x[1]), a(x[2]), n(x[3]));
    case "income_tax":
      return twin.income_tax(n(x[0]), n(x[1]));
    case "hold_value":
      return twin.hold_value(a(x[0]), a(x[1]), a(x[2]), n(x[3]), n(x[4]), n(x[5]));
    case "price_after_rate_shift":
      return twin.price_after_rate_shift(n(x[0]), n(x[1]), n(x[2]));
    case "periodic_rate_pct":
      return twin.periodic_rate_pct(n(x[0]), n(x[1]));
    case "value_along_path":
      return twin.value_along_path(a(x[0]), a(x[1]), n(x[2]), n(x[3]), a(x[4]));
    case "derive_bond":
      return twin.derive_bond(x[0] as Issue, x[1] as Market);
    case "calculate":
      return twin.calculate(x[0] as Issue, x[1] as Market, x[2] as Plan, n(x[3]));
    case "explain":
      return twin.explain(x[0] as Issue, x[1] as Market, x[2] as Plan, n(x[3]), x[4] as Curve | null);
    case "g_spread":
      return twin.g_spread(x[0] as Issue, x[1] as Market, x[2] as Curve | null);
    case "order_ticket":
      return twin.order_ticket(x[0] as Issue, x[1] as Market, x[2] as Order);
    case "curve_yield_pct":
      return twin.curve_yield_pct(a(x[0]), a(x[1]), n(x[2]));
    case "portfolio_tax":
      return twin.portfolio_tax(x[0] as HoldingYear[], n(x[1]));
    default:
      throw new Error(`unknown function ${fn}`);
  }
}

describe("TypeScript twin against cases.json", () => {
  it("covers every function", () => {
    expect(new Set(cases.map((c) => c.fn)).size).toBe(21);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const report = compare(run(c.fn, c.args), c.expect, c.name);
    expect(report.failures).toEqual([]);
  });

  it("traces the tax calculate computes, year by year, and solves the yields back to the price", () => {
    let checked = 0;
    for (const c of cases.filter((x) => x.fn === "explain")) {
      const r = run(c.fn, c.args) as ReturnType<typeof twin.explain>;
      if (!("ok" in r)) continue;
      const e = r.ok;
      const near = (g: number, w: number) => expect(Math.abs(g - w)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(g), Math.abs(w), 1));
      near(e.planTax.reduce((s, t) => s + t.tax, 0), -e.plan.tax);
      for (const t of e.planTax) {
        near(t.base, t.income + t.result + t.relieved - t.exempt);
        near(t.redemptions + t.sale - t.cost, t.result + t.relieved);
        near(t.taxedLow + t.taxedHigh, Math.max(t.base, 0));
      }
      // The plan is calculate's with the same fee.
      const calc = twin.calculate(...(decodeNaN(c.args.slice(0, 4)) as [Issue, Market, Plan, number]));
      if (!("ok" in calc)) throw new Error(calc.error);
      expect(e.plan).toEqual(calc.ok.plan);
      for (const y of [e.toMaturity, ...(e.toOffer ? [e.toOffer] : [])]) {
        expect(Math.abs(y.presentValue - e.price.dirty)).toBeLessThan(1e-6 * e.price.dirty);
        expect(y.ytmAfterFee).toBeLessThanOrEqual(y.ytm);
        near(y.tax.reduce((s, t) => s + t.tax, 0), -y.held.tax);
        expect(y.held.reinvest).toBe(0);
      }
      // The G-spreads are g_spread's, for the same issue and curve.
      const g = twin.g_spread(...(decodeNaN([c.args[0], c.args[1], c.args[4]]) as [Issue, Market, Curve]));
      if (!("ok" in g)) throw new Error(g.error);
      expect(e.toMaturity.gSpread).toEqual(g.ok.toMaturity);
      expect(e.toOffer?.gSpread ?? null).toEqual(g.ok.toOffer);
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("taxes a portfolio of one holding as the holding, year by year", () => {
    let checked = 0;
    for (const c of cases.filter((x) => x.fn === "explain")) {
      const r = run(c.fn, c.args) as ReturnType<typeof twin.explain>;
      if (!("ok" in r)) continue;
      const plan = decodeNaN(c.args[2]) as Plan;
      const p = twin.portfolio_tax(r.ok.planTax, plan.otherIncome);
      if (!("ok" in p)) throw new Error(p.error);
      expect(p.ok.map((y) => y.year)).toEqual(r.ok.planTax.map((t) => t.year));
      p.ok.forEach((y, i) => {
        const t = r.ok.planTax[i]!;
        for (const [got, want] of [
          [y.exempt, t.exempt],
          [y.base, t.base],
          [y.taxedLow, t.taxedLow],
          [y.taxedHigh, t.taxedHigh],
          [y.tax, t.tax],
        ] as const) {
          expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(got), Math.abs(want), 1));
        }
      });
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("refuses a portfolio year that is not a whole number", () => {
    const h = { year: 2027.5, income: 1, result: 0, relieved: 0, relievedProceeds: 0, relievedYears: 0 };
    expect(twin.portfolio_tax([h], 0)).toEqual({ error: "invalid_tax_year" });
  });

  it("adds the breakdown lines up to the total", () => {
    for (const c of cases.filter((x) => x.fn === "calculate")) {
      const r = run(c.fn, c.args) as ReturnType<typeof twin.calculate>;
      if (!("ok" in r)) continue;
      const b = r.ok.plan;
      const sum = b.coupons + b.reinvest + b.amort + b.body + b.tax + b.commission;
      expect(Math.abs(sum - b.total)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(b.total), 1));
      expect(b.tax).toBeLessThanOrEqual(0);
      expect(b.commission).toBeLessThanOrEqual(0);
    }
  });
});

describe("dates", () => {
  it("counts days across leap years", () => {
    expect(twin.parseIsoDate("1970-01-01")).toBe(0);
    expect(twin.parseIsoDate("2000-03-01")).toBe(11_017);
    expect(twin.parseIsoDate("0000-01-01")).toBe(-719_528);
    expect(twin.dayOffset("2027-09-04", "2028-09-04")).toBe(366);
  });

  it("rejects dates that do not exist or are malformed", () => {
    for (const s of ["", "2026-9-04", "2026-02-29", "2026-13-01", "2026-04-31", "2026-09-04T00:00:00Z"]) {
      expect(twin.parseIsoDate(s), s).toBeNull();
    }
  });
});
