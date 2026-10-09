// Worked examples: small issues whose results are computed by hand, with
// the arithmetic in the comments. The same examples run against the Rust
// crate in tests/worked.rs.
import { describe, expect, it } from "vitest";
import { COMMISSION_PCT, MIN_ANNUALISED_DAYS, TAX_THRESHOLD, calculate, dayOffset, effective_annual_pct, explain, g_spread, hold_value, income_tax, order_ticket, portfolio_tax } from "../src/index.js";
import type { Calculation, Curve, Explanation, GSpreads, Issue, Market, Order, Plan, Ticket } from "../src/index.js";

const close = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(want), 1));

const market = (valuationDate: string): Market => ({ valuationDate, keyRatePct: 16 });

// A zero-coupon curve of two published terms: 9 percent at one year, 12 at
// three. Read linearly between them, it rises 1.5 percentage points a year;
// before one year it stays at 9, after three at 12.
const curve: Curve = { termsYears: [1, 3], yieldsPct: [9, 12] };

function ok(r: ReturnType<typeof calculate>): Calculation {
  if (!("ok" in r)) throw new Error(r.error);
  return r.ok;
}

// A two-year floater at key rate plus 2, annual coupons, bought at par on a
// coupon day: valuation 2026-01-01, coupons on day 365 (2027-01-01) and day
// 730 (2028-01-01), no accrued interest. Its flows are 180 and 1,180 per
// bond, so its yield is 18 percent (1,180 / 1.18 = 1,000).
const floater: Issue = {
  nominal: 1000,
  pricePct: 100,
  accrued: null,
  couponType: "floater",
  couponRatePct: 0,
  spreadPct: 2,
  periodDays: 365,
  maturity: "2028-01-01",
  offers: [],
  amortization: [],
};

// Ten bonds held for a year, no tax, no reinvestment.
const floaterPlan = (rateShiftPct: number): Plan => ({
  amount: 10_000,
  horizonDay: 365,
  reinvest: false,
  taxRegime: "iis_b",
  otherIncome: 0,
  rateShiftPct,
});

describe("floaters", () => {
  it("sells a floater at the spread to the key rate, not by duration", () => {
    const c = ok(calculate(floater, market("2026-01-01"), floaterPlan(2), COMMISSION_PCT));
    // The plan: coupon 180 x 10 = 1,800; the day-730 flow sold on day 365 at
    // 18 percent: 1,180 / 1.18 = 1,000 x 10 = 10,000; commission 0.05
    // percent of 10,000 bought and 10,000 sold = 10. Total 11,790.
    close(c.plan.total, 11_790);
    // Key rate +2 by the horizon, in equal steps on each coupon up to the
    // first one after the horizon: 17 and then 18 percent, so the coupons
    // pay 19 and 20 percent (190 and 200). The spread to the key rate
    // stays: the day-730 flow is discounted at 20 percent, 1,200 / 1.2 =
    // 1,000. Coupons 1,900, sale 10,000, commission 10: total 11,890, 100
    // more than the plan.
    const e = c.earlyExit;
    close(e.result.coupons, 1_900);
    close(e.result.body, 10_000);
    close(e.result.total, 11_890);
    close(e.diff, 100);
  });

  it("keeps a floater at par in every key-rate scenario", () => {
    const s = ok(calculate(floater, market("2026-01-01"), floaterPlan(0), COMMISSION_PCT)).floater!.scenarios;
    // -2 over four coupons: 15.5 then 15 percent; coupons 175 and 170; the
    // day-730 flow, 1,170, discounted at 17 percent: 1,000.
    close(s[0]!.breakdown.body, 10_000);
    close(s[0]!.breakdown.total, 11_740);
    close(s[1]!.breakdown.total, 11_790);
    // +2: 16.5 then 17 percent; coupons 185 and 190; 1,190 / 1.19 = 1,000.
    close(s[2]!.breakdown.body, 10_000);
    close(s[2]!.breakdown.total, 11_840);
  });
});

// Two years, 10 percent annual coupons, half the nominal repaid with the
// first coupon: valuation 2026-01-01, coupons on day 365 and day 730,
// bought at par with no accrued interest. Per bond the flows are 100 + 500
// = 600 and 50 + 500 = 550, so the yield is 10 percent: 600 / 1.1 + 550 /
// 1.21 = 1,000.
const amortising: Issue = {
  nominal: 1000,
  pricePct: 100,
  accrued: null,
  couponType: "fixed",
  couponRatePct: 10,
  spreadPct: 0,
  periodDays: 365,
  maturity: "2028-01-01",
  offers: [],
  amortization: [{ date: "2027-01-01", fractionPct: 50 }],
};

describe("amortisation", () => {
  it("reinvests returned principal with the coupons", () => {
    // Coupon 100 and principal 500 on day 365 at 10 percent for a year: 60.
    const hv = hold_value([365, 730], [100, 50], [500, 500], 730, 0.1, 0.1);
    expect(Array.from(hv).map((x) => Math.round(x * 1e9) / 1e9)).toEqual([150, 60, 500, 500, 0]);
  });

  it("earns about the yield on an amortising plan", () => {
    const plan: Plan = { amount: 10_000, horizonDay: 730, reinvest: true, taxRegime: "iis_b", otherIncome: 0, rateShiftPct: 0 };
    const b = ok(calculate(amortising, market("2026-01-01"), plan, COMMISSION_PCT)).plan;
    // Coupons 1,000 + 500; the 5,000 repaid on day 365 and the 1,000
    // coupon earn 10 percent for a year: 600. Redemption 5,000; commission
    // 5. Total 12,095; annual sqrt(1.2095) - 1 = 9.977 percent.
    close(b.coupons, 1_500);
    close(b.reinvest, 600);
    close(b.amort, 5_000);
    close(b.body, 5_000);
    close(b.total, 12_095);
    close(b.annualPct!, 9.977_270_378_928_749);
  });
});

describe("short horizons", () => {
  it("gives no annual return under a month", () => {
    // The par floater for 29 and for 30 days: under 30 days only the return
    // over the period.
    const at = (horizonDay: number) => ok(calculate(floater, market("2026-01-01"), { ...floaterPlan(0), horizonDay }, COMMISSION_PCT)).plan;
    const short = at(29);
    expect(short.annualPct).toBeNull();
    close(short.periodPct, (short.total / short.invested - 1) * 100);
    const month = at(30);
    expect(month.annualPct).toBe(effective_annual_pct(month.invested, month.total, 30));
    expect(MIN_ANNUALISED_DAYS).toBe(30);
  });
});

// Annual 10 percent coupons, bought above par between coupons: valuation
// 2026-01-01, coupons on day 182 (2026-07-02) and day 547 (2027-07-02);
// accrued interest 100 x 183 / 365 = 50.136986; clean 1,050, dirty
// 1,100.136986.
const abovePar: Issue = {
  nominal: 1000,
  pricePct: 105,
  accrued: null,
  couponType: "fixed",
  couponRatePct: 10,
  spreadPct: 0,
  periodDays: 365,
  maturity: "2027-07-02",
  offers: [],
  amortization: [],
};

const aboveParPlan = (otherIncome: number): Plan => ({
  amount: 11_100,
  horizonDay: 547,
  reinvest: false,
  taxRegime: "standard",
  otherIncome,
  rateShiftPct: 0,
});

describe("tax", () => {
  it("nets the accrued interest paid and the loss against coupons", () => {
    const b = ok(calculate(abovePar, market("2026-01-01"), aboveParPlan(0), COMMISSION_PCT)).plan;
    // Ten bonds: invested 11,001.369863, accrued interest 501.369863,
    // purchase commission 5.500685.
    // 2026: coupon 1,000 less the accrued interest paid: 498.630137.
    // 2027: coupon 1,000; redemption 10,000 against a cost of 11,001.369863
    // - 501.369863 + 5.500685 = 10,505.500685, a loss of 505.500685:
    // 494.499315. Tax 13 percent of both: 129.106829. Total 2,000 + 10,000
    // - 129.106829 - 5.500685 = 11,865.392486.
    close(b.invested, 11_001.369_863_013_699);
    close(b.tax, -129.106_828_767_123_3);
    close(b.total, 11_865.392_486_301_369);
  });
});

describe("tax rates", () => {
  it("taxes 15 percent above 2.4 million a year", () => {
    close(income_tax(1_000, 0), 130);
    // 400,000 under the threshold at 13 percent, 600,000 at 15: 142,000.
    close(income_tax(1_000_000, 2_000_000), 142_000);
    close(income_tax(1_000, 3_000_000), 150);
    close(income_tax(-500, 0), 0);
    expect(TAX_THRESHOLD).toBe(2_400_000);
  });

  it("applies the threshold to each year", () => {
    // Bases 498.630137 (2026) and 494.499315 (2027); with 2,399,700 of other
    // income, 300 of each at 13 percent and the rest at 15: 68.794521 +
    // 68.174897 = 136.969418.
    const at = (other: number) => ok(calculate(abovePar, market("2026-01-01"), aboveParPlan(other), COMMISSION_PCT)).plan.tax;
    close(at(2_399_700), -136.969_417_808_219_2);
    close(at(3_000_000), -148.969_417_808_219_16);
  });
});

// A zero-coupon issue bought on 2026-09-04 and held to its maturity.
function zeroCoupon(pricePct: number, maturity: string, amount = 9_000): [Issue, Market, Plan] {
  const issue: Issue = {
    nominal: 1000,
    pricePct,
    accrued: null,
    couponType: "fixed",
    couponRatePct: 0,
    spreadPct: 0,
    periodDays: 1097,
    maturity,
    offers: [],
    amortization: [],
  };
  const m = market("2026-09-04");
  const horizonDay = dayOffset(m.valuationDate, maturity)!;
  return [issue, m, { amount, horizonDay, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 }];
}

describe("long-term holding relief", () => {
  it("starts the day after the third anniversary", () => {
    // Three years from 2026-09-04 end on 2029-09-04, day 1,096. Ten bonds
    // at 900: a gain of 10,000 - 9,004.5 = 995.5, taxed 129.415 on the
    // anniversary and exempt a day later.
    const [issue, m, plan] = zeroCoupon(90, "2029-09-04");
    expect(plan.horizonDay).toBe(1096);
    close(ok(calculate(issue, m, plan, COMMISSION_PCT)).plan.tax, -129.415);
    close(ok(calculate(...zeroCoupon(90, "2029-09-05"), COMMISSION_PCT)).plan.tax, 0);
  });

  it("is capped at 3 million for each full year held", () => {
    // 2,000,000 bonds at 500; gain 2,000,000,000 - 1,000,500,000 =
    // 999,500,000; 9,000,000 exempt; 990,500,000 taxed: 312,000 + 15
    // percent of 988,100,000 = 148,527,000.
    const b = ok(calculate(...zeroCoupon(50, "2029-09-05", 1e9), COMMISSION_PCT)).plan;
    close(b.qty, 2_000_000);
    close(b.tax, -148_527_000);
    close(b.total, 1_850_973_000);
  });

  it("leaves coupons taxed", () => {
    // 10 percent annual coupons on 2027-01-01, 2028-01-01, 2028-12-31 and
    // 2029-12-31, ten bonds at 900: coupons taxed 4 x 130 = 520, the gain
    // of 995.5 exempt. Total 4,000 + 10,000 - 520 - 4.5 = 13,475.5.
    const issue: Issue = { ...abovePar, pricePct: 90, maturity: "2029-12-31" };
    const plan: Plan = { amount: 9_000, horizonDay: 1460, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 };
    const b = ok(calculate(issue, market("2026-01-01"), plan, COMMISSION_PCT)).plan;
    close(b.tax, -520);
    close(b.total, 13_475.5);
  });
});

function explained(r: ReturnType<typeof explain>): Explanation {
  if (!("ok" in r)) throw new Error(r.error);
  return r.ok;
}

// A one-year bullet, 10 percent annual coupon, bought at par on the
// valuation date, 2026-01-01; maturity 2027-01-01 (day 365). The only
// coupon day is maturity, so the accrued interest is 0 and the dirty price
// is 1,000. The one flow is 100 + 1,000 = 1,100.
const bullet: Issue = {
  nominal: 1000,
  pricePct: 100,
  accrued: null,
  couponType: "fixed",
  couponRatePct: 10,
  spreadPct: 0,
  periodDays: 365,
  maturity: "2027-01-01",
  offers: [],
  amortization: [],
};

// Ten bonds (10,100 buys floor(10,100 / 1,000) = 10), held a year in a
// brokerage account.
const bulletPlan = (otherIncome: number): Plan => ({
  amount: 10_100,
  horizonDay: 365,
  reinvest: false,
  taxRegime: "standard",
  otherIncome,
  rateShiftPct: 0,
});

// 7.3 percent paid every 180 days: 36 a coupon, on days 90, 270 and 450
// after 2026-01-01; 90 days since the last coupon, so accrued interest 18
// and a dirty price of 1,018.
const midPeriod: Issue = { ...bullet, couponRatePct: 7.3, periodDays: 180, maturity: "2027-03-27" };

describe("explain", () => {
  it("works out the yield and the fee", () => {
    const e = explained(explain(bullet, market("2026-01-01"), bulletPlan(0), 1, curve));
    close(e.price.clean, 1000);
    close(e.price.accrued, 0);
    close(e.price.dirty, 1000);
    const m = e.toMaturity;
    expect(m.flows).toHaveLength(1);
    // 1,100 a year away at 10 percent: 1,100 / 1.1 = 1,000, the price back.
    close(m.flows[0]!.amount, 1100);
    close(m.flows[0]!.years, 1);
    expect(Math.abs(m.ytm - 0.1)).toBeLessThan(1e-9);
    expect(Math.abs(m.flows[0]!.factor - 1 / 1.1)).toBeLessThan(1e-9);
    expect(Math.abs(m.presentValue - 1000)).toBeLessThan(1e-6);
    // A fee of 1 percent: 1,010 for the same 1,100, so 9 / 101 = 8.9109 percent.
    close(m.priceWithFee, 1010);
    expect(Math.abs(m.ytmAfterFee - 9 / 101)).toBeLessThan(1e-9);
  });

  it("traces the tax and the yield after it", () => {
    const e = explained(explain(bullet, market("2026-01-01"), bulletPlan(0), 1, curve));
    const held = e.toMaturity.held;
    close(held.invested, 10_000);
    close(held.commission, -100);
    // 2027: coupons 1,000; redemption 10,000 against a cost of 10,100, a
    // loss of 100 netted; base 900 at 13 percent: 117.
    expect(e.toMaturity.tax).toHaveLength(1);
    const t = e.toMaturity.tax[0]!;
    expect(t.year).toBe(2027);
    close(t.coupons, 1000);
    close(t.accruedPaid, 0);
    close(t.redemptions, 10_000);
    close(t.cost, 10_100);
    close(t.result, -100);
    close(t.base, 900);
    close(t.taxedLow, 900);
    close(t.taxedHigh, 0);
    close(t.tax, 117);
    // 1,000 + 10,000 - 117 - 100 = 10,783 after exactly a year: 7.83 percent.
    close(held.total, 10_783);
    close(held.annualPct!, 7.83);
    // With 2,399,900 of other income: 100 at 13 percent, 800 at 15: 133.
    const high = explained(explain(bullet, market("2026-01-01"), bulletPlan(TAX_THRESHOLD - 100), 1, curve)).toMaturity.tax[0]!;
    close(high.taxedLow, 100);
    close(high.taxedHigh, 800);
    close(high.tax, 133);
  });

  it("shows accrued interest paid and received", () => {
    const plan: Plan = { amount: 10_180, horizonDay: 180, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 };
    const e = explained(explain(midPeriod, market("2026-01-01"), plan, COMMISSION_PCT, curve));
    close(e.price.couponAmount, 36);
    close(e.price.daysSinceLast, 90);
    close(e.price.accrued, 18);
    close(e.price.dirty, 1018);
    // 2026: the day-90 coupon, 360, less the 180 of accrued interest paid;
    // the sale on day 180 holds 18 a bond accrued since day 90: 180.
    expect(e.planTax).toHaveLength(1);
    const t = e.planTax[0]!;
    expect(t.year).toBe(2026);
    close(t.coupons, 360);
    close(t.accruedPaid, 180);
    close(t.income, 180);
    close(t.accruedReceived, 180);
    // 10,180 paid, plus 0.05 percent, less the 180 deducted: 10,005.09; and
    // the sale's own 0.05 percent.
    close(t.cost, 10_005.09 + t.sale * 0.0005);
    close(t.result, t.sale - t.cost);
    const y = e.toMaturity.ytm;
    close(t.sale, 10 * (36 * Math.pow(1 + y, -90 / 365) + 1036 * Math.pow(1 + y, -270 / 365)));
    close(ok(calculate(midPeriod, market("2026-01-01"), plan, COMMISSION_PCT)).plan.tax, -t.tax);
  });

  it("refuses a fee it cannot use, after the plan's own errors", () => {
    for (const fee of [-0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(explain(bullet, market("2026-01-01"), bulletPlan(0), fee, curve)).toEqual({ error: "invalid_fee" });
    }
    expect(explain(bullet, market("2026-01-01"), { ...bulletPlan(0), amount: 0 }, -1, curve)).toEqual({ error: "amount_not_positive" });
  });
});

function spreads(r: ReturnType<typeof g_spread>): GSpreads {
  if (!("ok" in r)) throw new Error(r.error);
  return r.ok;
}

// A three-year bond, 10 percent annual coupon, at par on 2029-01-01, with a
// put offer on its first coupon day, 2030-01-01. Coupons on days 365, 730
// and 1,095, whole years; the dirty price is 1,000 and both yields are 10
// percent.
const withOffer: Issue = { ...bullet, maturity: "2032-01-01", offers: ["2030-01-01"] };

describe("g_spread", () => {
  it("reads the curve at each duration", () => {
    const g = spreads(g_spread(withOffer, market("2029-01-01"), curve));
    // To maturity: 100 / 1.1 + 100 / 1.21 + 1,100 / 1.331 = 1,000; weighted
    // by their years, 3,641 / 1,331 = 2.7355 years. The curve there: 9 +
    // 1.5 x (3,641 / 1,331 - 1) = 9 + 3,465 / 1,331 = 11.6033 percent; the
    // spread (10 - 11.6033) x 100 = -2,134 / 1,331 x 100 = -160.33 bp.
    const m = g.toMaturity;
    expect(Math.abs(m.yieldPct - 10)).toBeLessThan(1e-9);
    expect(Math.abs(m.durationYears - 3641 / 1331)).toBeLessThan(1e-9);
    expect([m.termBelowYears, m.yieldBelowPct, m.termAboveYears, m.yieldAbovePct]).toEqual([1, 9, 3, 12]);
    expect(Math.abs(m.curvePct - (9 + 3465 / 1331))).toBeLessThan(1e-9);
    expect(Math.abs(m.spreadBp - (-2134 / 1331) * 100)).toBeLessThan(1e-6);
    // To the offer: 1,100 in a year at 10 percent, duration one year, the
    // curve's first term at 9 percent: +100 bp.
    const o = g.toOffer!;
    expect(Math.abs(o.durationYears - 1)).toBeLessThan(1e-12);
    expect(Math.abs(o.curvePct - 9)).toBeLessThan(1e-9);
    expect(Math.abs(o.spreadBp - 100)).toBeLessThan(1e-6);
    // explain carries the same spreads.
    const plan: Plan = { amount: 10_000, horizonDay: 365, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 };
    const e = explained(explain(withOffer, market("2029-01-01"), plan, COMMISSION_PCT, curve));
    expect(e.toMaturity.gSpread).toEqual(m);
    expect(e.toOffer!.gSpread).toEqual(o);
  });

  it("holds the curve flat beyond its terms", () => {
    // The one-year bullet: duration one year, yield 10 percent. Beyond the
    // half-year term the curve stays at 9: +100 bp; before the two-year term
    // it stays at 11: -100 bp.
    const short = spreads(g_spread(bullet, market("2026-01-01"), { termsYears: [0.25, 0.5], yieldsPct: [8, 9] })).toMaturity;
    expect([short.termBelowYears, short.termAboveYears, short.curvePct]).toEqual([0.5, 0.5, 9]);
    expect(Math.abs(short.spreadBp - 100)).toBeLessThan(1e-6);
    const long = spreads(g_spread(bullet, market("2026-01-01"), { termsYears: [2, 5], yieldsPct: [11, 13] }));
    expect([long.toMaturity.termBelowYears, long.toMaturity.termAboveYears, long.toMaturity.curvePct]).toEqual([2, 2, 11]);
    expect(Math.abs(long.toMaturity.spreadBp + 100)).toBeLessThan(1e-6);
    expect(long.toOffer).toBeNull();
  });

  it("refuses a curve it cannot read, after the issue's errors and, in explain, the fee", () => {
    const m = market("2026-01-01");
    for (const missing of [null, undefined, { termsYears: [], yieldsPct: [] }]) {
      expect(g_spread(bullet, m, missing)).toEqual({ error: "curve_missing" });
    }
    for (const bad of [
      { termsYears: [1, 2], yieldsPct: [10] },
      { termsYears: [], yieldsPct: [10] },
      { termsYears: [2, 1], yieldsPct: [10, 11] },
      { termsYears: [1, 1], yieldsPct: [10, 11] },
      { termsYears: [0, 1], yieldsPct: [10, 11] },
      { termsYears: [-1, 1], yieldsPct: [10, 11] },
      { termsYears: [1, Number.POSITIVE_INFINITY], yieldsPct: [10, 11] },
      { termsYears: [1, 2], yieldsPct: [10, Number.NaN] },
    ]) {
      expect(g_spread(bullet, m, bad), JSON.stringify(bad)).toEqual({ error: "invalid_curve" });
    }
    expect(g_spread({ ...bullet, maturity: "2025-01-01" }, m, null)).toEqual({ error: "matured" });
    expect(explain(bullet, m, bulletPlan(0), -1, null)).toEqual({ error: "invalid_fee" });
    expect(explain(bullet, m, bulletPlan(0), 1, null)).toEqual({ error: "curve_missing" });
  });
});

describe("calculate's fee", () => {
  it("is charged on the purchase and on a sale, not at redemption", () => {
    const m = market("2026-01-01");
    // The one-year bullet, ten bonds to maturity at a fee of 1 percent: 100
    // on the 10,000 paid; tax on 1,000 of coupons less the 100 lost, 900 at
    // 13 percent, 117; total 10,783, as explain's holding to maturity.
    const c = ok(calculate(bullet, m, bulletPlan(0), 1)).plan;
    close(c.commission, -100);
    close(c.tax, -117);
    close(c.total, 10_783);
    // No fee: 130 of tax on 1,000; total 10,870.
    const c0 = ok(calculate(bullet, m, bulletPlan(0), 0)).plan;
    close(c0.commission, 0);
    close(c0.tax, -130);
    close(c0.total, 10_870);
    // Sold on day 100: 1 percent of the 10,000 paid and of the sale, the
    // 1,100 due on day 365 discounted 265 days at 10 percent, ten bonds.
    const s = ok(calculate(bullet, m, { ...bulletPlan(0), horizonDay: 100 }, 1)).plan;
    const sale = 10 * 1100 * Math.pow(1.1, -265 / 365);
    expect(Math.abs(s.body - sale)).toBeLessThan(1e-6);
    expect(Math.abs(s.commission + (10_000 + sale) * 0.01)).toBeLessThan(1e-6);
  });

  it("refuses a fee it cannot use, after the plan's own errors", () => {
    const m = market("2026-01-01");
    for (const fee of [-0.01, Number.NaN, Number.POSITIVE_INFINITY]) expect(calculate(bullet, m, bulletPlan(0), fee)).toEqual({ error: "invalid_fee" });
    expect(calculate(bullet, m, { ...bulletPlan(0), amount: 0 }, -1)).toEqual({ error: "amount_not_positive" });
  });
});

// The order ticket. Two lots of ten bonds of the one-year bullet, a fee of
// 0.1 percent, a price step of 0.01.
const order = (side: Order["side"], limit: Order["limit"], limitValue: number): Order => ({ side, limit, limitValue, lots: 2, lotSize: 10, tickPct: 0.01, feePct: 0.1 });

function ticket(r: ReturnType<typeof order_ticket>): Ticket {
  if (!("ok" in r)) throw new Error(r.error);
  return r.ok;
}

describe("order_ticket", () => {
  it("gives the yield at a limit price, with lots and the fee", () => {
    const m = market("2026-01-01");
    const t = ticket(order_ticket(bullet, m, order("buy", "price", 100)));
    // 20 bonds at 1,000, no accrued interest: 20,000; fee 20; paid 20,020.
    expect(t.bonds).toBe(20);
    close(t.clean, 1000);
    close(t.accrued, 0);
    close(t.amount, 20_000);
    close(t.fee, 20);
    close(t.total, 20_020);
    // 1,100 a year after 1,000: 10 percent; after the fee 1,100 / 1,001 - 1.
    close(t.yieldEvent, 0.1);
    expect(t.event).toBe("maturity");
    close(t.yieldEventAfterFee, 1100 / 1001 - 1);
    // A sale brings 19,980; the yield given up is the one at 999 a bond.
    const s = ticket(order_ticket(bullet, m, order("sell", "price", 100)));
    close(s.total, 19_980);
    close(s.yieldEventAfterFee, 1100 / 999 - 1);
  });

  it("gives the price at a limit yield, with the accrued interest, on the price step", () => {
    const m = market("2026-01-01");
    const issue: Issue = { ...bullet, accrued: 25 };
    // At 10 percent: 1,100 / 1.1 = 1,000 with the accrued interest, 975
    // clean, 97.5 percent. Three bonds: 2,925 and 75, fee 1.5, 3,001.5.
    const t = ticket(order_ticket(issue, m, { ...order("buy", "yield", 10), lots: 3, lotSize: 1, feePct: 0.05 }));
    close(t.cleanPct, 97.5);
    close(t.dirty, 1000);
    close(t.cleanAmount, 2925);
    close(t.accruedAmount, 75);
    close(t.total, 3001.5);
    close(t.yieldEvent, 0.1);
    // At 10.5 percent the exact clean price is 97.04751... percent: a buy
    // goes down to 97.04, a sell up to 97.05.
    const buy = ticket(order_ticket(issue, m, order("buy", "yield", 10.5)));
    close(buy.cleanPct, 97.04);
    close(buy.yieldEvent, 1100 / 995.4 - 1);
    expect(buy.yieldEvent).toBeGreaterThan(0.105);
    const sell = ticket(order_ticket(issue, m, order("sell", "yield", 10.5)));
    close(sell.cleanPct, 97.05);
    close(sell.yieldEvent, 1100 / 995.5 - 1);
    expect(sell.yieldEvent).toBeLessThan(0.105);
    const exact = ticket(order_ticket(issue, m, { ...order("buy", "yield", 10.5), tickPct: 0 }));
    close(exact.cleanPct, (1100 / 1.105 - 25) / 10);
  });

  it("takes the yield to the offer when there is one", () => {
    const m = market("2026-01-01");
    const issue: Issue = { ...bullet, maturity: "2028-01-01", offers: ["2027-01-01"] };
    const t = ticket(order_ticket(issue, m, order("buy", "price", 98)));
    expect(t.event).toBe("offer");
    expect(t.eventDay).toBe(365);
    close(t.ytmOffer!, 1100 / 980 - 1);
    close(t.yieldEvent, 1100 / 980 - 1);
    // To maturity x = 1 / (1 + y) solves 1,100 x^2 + 100 x - 980 = 0.
    const x = (-100 + Math.sqrt(100 * 100 + 4 * 1100 * 980)) / 2200;
    expect(Math.abs(t.ytmMaturity - (1 / x - 1))).toBeLessThan(1e-9);
    close(ticket(order_ticket(issue, m, order("buy", "yield", 10))).cleanPct, 100);
  });

  it("refuses what it cannot price, in order", () => {
    const m = market("2026-01-01");
    const err = (o: Partial<Order>) => order_ticket(bullet, m, { ...order("buy", "price", 100), ...o });
    expect(err({ lots: 0 })).toEqual({ error: "invalid_quantity" });
    expect(err({ lots: 1.5 })).toEqual({ error: "invalid_quantity" });
    expect(err({ lotSize: Number.NaN })).toEqual({ error: "invalid_quantity" });
    expect(err({ limitValue: 0 })).toEqual({ error: "invalid_limit" });
    expect(err({ limitValue: Number.POSITIVE_INFINITY })).toEqual({ error: "invalid_limit" });
    expect(err({ limit: "yield", limitValue: -99 })).toEqual({ error: "invalid_limit" });
    expect(err({ tickPct: -0.01 })).toEqual({ error: "invalid_tick" });
    expect(err({ limitValue: 97.045 })).toEqual({ error: "price_off_tick" });
    expect(err({ feePct: -1 })).toEqual({ error: "invalid_fee" });
    expect(err({ lots: 0, limitValue: -1 })).toEqual({ error: "invalid_quantity" });
    expect(err({ limitValue: -1, feePct: -1 })).toEqual({ error: "invalid_limit" });
    expect(order_ticket(bullet, market("2027-06-01"), order("buy", "price", 0))).toEqual({ error: "matured" });
    // Codes are read before anything else, as at the engine's JavaScript boundary.
    expect(order_ticket(bullet, market("2027-06-01"), { ...order("buy", "price", 0), side: "hold" as Order["side"] })).toEqual({ error: "invalid_code" });
  });
});

// A portfolio of two one-year bonds, annual coupon, bought on 2026-01-01
// (a coupon day, no accrued interest) and held to maturity on 2027-01-01
// (day 365), 100 bonds each, no fee, an ordinary account, no other income.
// At par with a 10 percent coupon: coupons 10,000, result 0, alone a tax of
// 1,300. At 105 with a 1 percent coupon: coupons 1,000, result -5,000,
// alone a base of -4,000 and no tax. Together: income 11,000, result
// -5,000, base 6,000, tax 780.
describe("portfolio_tax", () => {
  const oneYear = (pricePct: number, couponRatePct: number): Issue => ({
    nominal: 1000,
    pricePct,
    accrued: null,
    couponType: "fixed",
    couponRatePct,
    spreadPct: 0,
    periodDays: 365,
    maturity: "2027-01-01",
    offers: [],
    amortization: [],
  });
  const held = (issue: Issue) => {
    // Half a bond over, so exactly 100 are bought.
    const plan: Plan = { amount: 100.5 * 10 * issue.pricePct, horizonDay: 365, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 };
    const r = explain(issue, market("2026-01-01"), plan, 0, curve);
    if (!("ok" in r)) throw new Error(r.error);
    return r.ok.planTax;
  };

  it("nets one holding's loss against another's coupons", () => {
    const par = held(oneYear(100, 10));
    const premium = held(oneYear(105, 1));
    close(par[0]!.income, 10_000);
    close(par[0]!.tax, 1_300);
    close(premium[0]!.income, 1_000);
    close(premium[0]!.result, -5_000);
    close(premium[0]!.tax, 0);
    const r = portfolio_tax([...par, ...premium], 0);
    if (!("ok" in r)) throw new Error(r.error);
    expect(r.ok).toHaveLength(1);
    const y = r.ok[0]!;
    expect([y.year, y.holdings]).toEqual([2027, 2]);
    close(y.income, 11_000);
    close(y.result, -5_000);
    close(y.base, 6_000);
    close(y.tax, 780);
  });
});

// One issue with a gaining and a losing relieved disposal in one year,
// where the relief's cap binds. A zero-coupon bond valued on 2026-07-01,
// half its nominal repaid on 2030-03-01 (day 1,339, a coupon day of the
// 1,279-day period counted back from maturity) and the rest on 2040-09-01
// (day 5,176). 100,000 bonds at 600, no fee, sold on 2030-09-01 (day
// 1,523), an ordinary account, no other income.
//
// - The cost, 60,000,000, is spread by nominal: 300 a bond against each half.
// - The redemption, held three full years (the third anniversary was
//   2029-07-01): 500 - 300 = 200 a bond, a gain of 20,000,000 on proceeds
//   of 50,000,000.
// - The sale, held four full years: the remaining 500 on day 5,176
//   discounted at the purchase yield y over 3,653 days. y = 0.0653836 (500 /
//   (1 + y)^(1339/365) + 500 / (1 + y)^(5176/365) = 600), so the sale brings
//   500 / (1 + y)^(3653/365) = 265.2675 a bond, 26,526,748 in all, and loses
//   3,473,252.
//
// The year's relieved result is 16,526,748. Tax Code article 219.1,
// paragraph 2, subparagraph 2: Vi counts only the disposals that gain, so
// Kцб = 3 and the cap is 9,000,000. The base is 7,526,748: 312,000 + 15
// percent of 5,126,748 = 1,081,012. Counting the losing sale's proceeds as
// well would give Kцб = 3.3466 and a cap of 10,039,901.
describe("the long-term holding relief's coefficient", () => {
  const issue: Issue = {
    nominal: 1000,
    pricePct: 60,
    accrued: null,
    couponType: "fixed",
    couponRatePct: 0,
    spreadPct: 0,
    periodDays: 1279,
    maturity: "2040-09-01",
    offers: [],
    amortization: [{ date: "2030-03-01", fractionPct: 50 }],
  };
  // Half a bond over, so exactly 100,000 are bought.
  const plan: Plan = { amount: 100_000.5 * 600, horizonDay: 1523, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 };

  it("counts only the disposals that gain", () => {
    const r = explain(issue, market("2026-07-01"), plan, 0, curve);
    if (!("ok" in r)) throw new Error(r.error);
    const t = r.ok.planTax.find((x) => x.year === 2030)!;
    close(t.redemptions, 50_000_000);
    expect(Math.abs(t.sale - 26_526_748.085_864)).toBeLessThan(1e-3);
    expect(Math.abs(t.relieved - 16_526_748.085_864)).toBeLessThan(1e-3);
    close(t.result, 0);
    // Vi and the years weighted by it: the redemption only.
    close(t.relievedProceeds, 50_000_000);
    close(t.relievedYears, 150_000_000);
    close(t.exempt, 9_000_000);
    close(t.base, t.relieved - 9_000_000);
    close(t.tax, 312_000 + 0.15 * (t.base - 2_400_000));
    const b = ok(calculate(issue, market("2026-07-01"), plan, 0)).plan;
    close(b.tax, -t.tax);
    expect(Math.abs(b.tax + 1_081_012.212_88)).toBeLessThan(1e-3);
  });

  it("counts a gaining disposal of a holding whose relieved result is a loss", () => {
    // 2031: one holding's relieved disposals lose 1,000,000 net, though one
    // of them gained on proceeds of 10,000,000 held three years; another's
    // gain 20,000,000 on proceeds of 10,000,000 held five years. Kцб = (3 x
    // 10,000,000 + 5 x 10,000,000) / 20,000,000 = 4, a cap of 12,000,000
    // against 19,000,000 relieved; base 7,000,000; tax 312,000 + 15 percent
    // of 4,600,000 = 1,002,000.
    const relieved = (r: number, proceeds: number, years: number) => ({ year: 2031, income: 0, result: 0, relieved: r, relievedProceeds: proceeds, relievedYears: years * proceeds });
    const res = portfolio_tax([relieved(-1_000_000, 10_000_000, 3), relieved(20_000_000, 10_000_000, 5)], 0);
    if (!("ok" in res)) throw new Error(res.error);
    const y = res.ok[0]!;
    close(y.relieved, 19_000_000);
    close(y.relievedProceeds, 20_000_000);
    close(y.relievedYears, 80_000_000);
    close(y.reliefCap, 12_000_000);
    close(y.exempt, 12_000_000);
    close(y.base, 7_000_000);
    close(y.tax, 1_002_000);
  });
});
