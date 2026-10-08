// The ladder: its URL, the issues each rung can take, and its figures
// from the engine (the twin here; the two engines agree, parity.test.ts).
import { describe, expect, it } from "vitest";
import { derive_bond, explain, portfolio_tax, ytm_effective, type Plan } from "@tyche/yield-twin";
import { parseAccess } from "../data/issues";
import { CURVE, MARKET, VALUATION_DATE } from "../data/market";
import { BONDS, accessJson } from "../data/universe.testing";
import { twinEngine } from "../engine/twin";
import type { Item } from "./filters";
import { LADDER_DEFAULT, candidates, chooseRungs, excluded, exitDay, flowsByYear, lastPaymentByYear, readLadder, workLadder, writeLadder, type Rung } from "./ladder";

const ITEMS: Item[] = BONDS.flatMap((bond) => {
  const r = derive_bond(bond.issue, MARKET);
  return "ok" in r ? [{ bond, derived: r.ok }] : [];
});
/** Who may buy each issue, as tyche-market's WebAssembly build says. */
const ACCESS = parseAccess(accessJson());

describe("the ladder in the URL", () => {
  it("is read from ?lh=, ?la= and ?lr=, a value out of range falling back to the default, and written back", () => {
    expect(readLadder(new URLSearchParams("q=x"))).toBeNull();
    expect(readLadder(new URLSearchParams("lh=5&la=2000000&lr=SG-143&lr=-&lr=KAMF-01"))).toEqual({ years: 5, amount: 2_000_000, picks: ["SG-143", null, "KAMF-01"] });
    expect(readLadder(new URLSearchParams("lh=11&la=5"))).toEqual({ years: LADDER_DEFAULT.years, amount: LADDER_DEFAULT.amount, picks: [] });
    const p = new URLSearchParams("q=x&lh=2");
    writeLadder(p, { years: 4, amount: 300_000, picks: ["A-01", null] });
    expect(p.toString()).toBe("q=x&lh=4&la=300000&lr=A-01&lr=-");
    writeLadder(p, null);
    expect(p.toString()).toBe("q=x");
  });
});

describe("the issues a rung can take", () => {
  it("are open to every investor, not linkers and without a call, with the exit in the rung's year, the highest yield first", () => {
    const rungs = candidates(ITEMS, ACCESS, 5);
    expect(rungs).toHaveLength(5);
    rungs.forEach((list, k) => {
      expect(list.length, `rung ${k}`).toBeGreaterThan(0);
      for (const i of list) {
        expect(excluded(i, ACCESS.get(i.bond.id))).toBeNull();
        expect(exitDay(i)).toBeGreaterThan(k * 365);
        expect(exitDay(i)).toBeLessThanOrEqual((k + 1) * 365);
      }
      for (let n = 1; n < list.length; n++) expect(list[n]!.derived.yieldEvent).toBeLessThanOrEqual(list[n - 1]!.derived.yieldEvent);
    });
    // A put offer is the exit; a call offer, a linker, a test or a
    // qualified-only issue never makes a rung.
    const all = rungs.flat();
    expect(all.some((i) => i.bond.offer?.kind === "put" && exitDay(i) === i.derived.offerDay)).toBe(true);
    expect(all.some((i) => i.bond.offer?.kind === "call" || i.bond.coupon.kind === "linker" || ACCESS.get(i.bond.id) !== "open")).toBe(false);
  });

  it("are the highest yield unless the person picked one the rung can take, or emptied the rung", () => {
    const rungs = candidates(ITEMS, ACCESS, 3);
    const second = rungs[1]![1]!.bond.id;
    const chosen = chooseRungs(rungs, ["NOPE-01", second, null]);
    expect(chosen[0]).toBe(rungs[0]![0]);
    expect(chosen[1]!.bond.id).toBe(second);
    expect(chosen[2]).toBeNull();
  });
});

describe("the ladder's figures", () => {
  const rungs = chooseRungs(candidates(ITEMS, ACCESS, 3), []);
  const r = workLadder(twinEngine, MARKET, CURVE, rungs, 1_000_000, 0.05);
  const done = r.rungs.filter((x): x is Rung => x !== null && "held" in x);

  it("split the amount equally, in whole lots at the dirty price, each rung held to its exit as explain holds it", () => {
    expect(done).toHaveLength(3);
    for (const rung of done) {
      const { item } = rung;
      const perLot = item.derived.dirtyPrice * item.bond.lot;
      expect(rung.bonds % item.bond.lot).toBe(0);
      expect(rung.bonds * item.derived.dirtyPrice).toBeLessThanOrEqual(1_000_000 / 3);
      expect(rung.bonds * item.derived.dirtyPrice + perLot).toBeGreaterThan(1_000_000 / 3);
      const plan: Plan = { amount: (rung.bonds + 0.5) * item.derived.dirtyPrice, horizonDay: rung.exit, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 };
      const e = explain(item.bond.issue, MARKET, plan, 0.05, CURVE);
      if (!("ok" in e)) throw new Error(e.error);
      const trace = rung.offer ? e.ok.toOffer! : e.ok.toMaturity;
      expect(rung.held).toEqual(trace.held);
      expect(rung.tax).toEqual(trace.tax);
      expect(rung.before).toBe(trace.held.total - trace.held.tax);
      expect(rung.held.qty).toBe(rung.bonds);
      expect(rung.held.reinvest).toBe(0);
    }
  });

  it("tax the rungs together: their tax years in one base per calendar year, as the engine's portfolio tax", () => {
    const want = portfolio_tax(done.flatMap((x) => x.tax), 0);
    if (!("ok" in want)) throw new Error(want.error);
    expect(r.taxYears).toEqual(want.ok);
    expect(r.tax).toBeCloseTo(want.ok.reduce((s, y) => s + y.tax, 0), 6);
    // Under the threshold the rungs together pay no more than each on its
    // own: a loss on one rung can only lower the tax on another.
    expect(r.tax).toBeLessThanOrEqual(done.reduce((s, x) => s - x.held.tax, 0) + 1e-6);
  });

  it("share the threshold of the 13 percent rate between the rungs", () => {
    // 100 million over ten rungs: each rung's coupons stay under 2.4
    // million a year, the rungs' together do not, so the ladder pays more
    // than the rungs on their own would.
    const ten = chooseRungs(candidates(ITEMS, ACCESS, 10), []).filter((x) => x !== null);
    const big = workLadder(twinEngine, MARKET, CURVE, ten, 100_000_000, 0.05);
    const rungsOf = big.rungs.filter((x): x is Rung => x !== null && "held" in x);
    expect(big.taxYears.some((y) => y.taxedHigh > 0)).toBe(true);
    expect(big.tax).toBeGreaterThan(rungsOf.reduce((s, x) => s - x.held.tax, 0));
  });

  it("give the ladder's yield as the engine's yield of what the rungs bring at their exits, less each year's tax on its last payment, against what they cost", () => {
    expect(r.invested).toBeCloseTo(done.reduce((s, x) => s + x.held.invested, 0), 6);
    expect(r.before).toBeCloseTo(done.reduce((s, x) => s + x.before, 0), 6);
    expect(r.received).toBeCloseTo(r.before - r.tax, 6);
    const last = lastPaymentByYear(VALUATION_DATE, done);
    const owed = r.taxYears.filter((y) => y.tax > 0);
    expect(owed.length).toBeGreaterThan(0);
    for (const y of owed) expect(last.has(y.year), String(y.year)).toBe(true);
    expect(r.yieldAfter).toBe(
      ytm_effective(
        [...done.map((x) => x.before), ...owed.map((y) => -y.tax)],
        [...done.map((x) => x.exit), ...owed.map((y) => last.get(y.year)!)],
        r.invested,
      ),
    );
    // Below the yield before tax, which has the same flows and no tax.
    expect(r.yieldAfter).toBeLessThan(ytm_effective(done.map((x) => x.before), done.map((x) => x.exit), r.invested));
  });

  it("say when a rung's share does not buy a lot, and leave an emptied rung out of the split", () => {
    const small = workLadder(twinEngine, MARKET, CURVE, [rungs[0]!, null, null], 1, 0.05);
    expect(small.rungs[0]).toEqual({ item: rungs[0], error: "below_lot" });
    expect(Number.isNaN(small.yieldAfter)).toBe(true);
    const two = workLadder(twinEngine, MARKET, CURVE, [rungs[0]!, null, rungs[2]!], 1_000_000, 0.05);
    const first = two.rungs[0] as Rung;
    expect(first.bonds * first.item.derived.dirtyPrice).toBeGreaterThan(1_000_000 / 3);
  });

  it("set out the payments by year, before tax, as each rung's flows times its bonds", () => {
    const years = flowsByYear(VALUATION_DATE, done);
    const total = (f: (x: { coupons: number; principal: number }) => number) => years.reduce((s, y) => s + f(y), 0);
    const want = done.reduce((s, x) => s + x.flows.coupons.reduce((a, c) => a + c, 0) * x.bonds, 0);
    expect(total((y) => y.coupons)).toBeCloseTo(want, 6);
    // Every rung's principal comes back by its exit.
    expect(total((y) => y.principal)).toBeCloseTo(done.reduce((s, x) => s + x.bonds * x.item.bond.issue.nominal, 0), 4);
    expect(years.map((y) => y.year)).toEqual([...years.map((y) => y.year)].sort());
  });
});
