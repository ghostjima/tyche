/*
  explain: the working behind an issue's figures, for a screen that shows
  it. The price and its accrued interest; the yields to maturity and to the
  offer solved from the discounted flows; the yields after a broker's fee;
  what holding to each event leaves after tax and the fee without
  reinvesting anything; the tax year by year.
*/

import { breakdownOf, checkPlan, isTaxRegime, type Holding } from "./calculate.js";
import { parseIsoDate } from "./dates.js";
import { amountsOf, derive_bond, isCouponType } from "./issue.js";
import { YEAR, ytm_effective } from "./primitives.js";
import type { Explanation, FlowTrace, Issue, Market, Plan, Result, Schedule, YieldTrace } from "./types.js";

/*
  Errors as calculate, then invalid_fee for a fee that is not a finite
  number of at least zero
*/
export function explain(issue: Issue, market: Market, plan: Plan, feePct: number): Result<Explanation> {
  if (!isCouponType(issue.couponType) || !isTaxRegime(plan.taxRegime)) {
    return { error: "invalid_code" };
  }
  const derived = derive_bond(issue, market);
  if ("error" in derived) return derived;
  const d = derived.ok;
  const qty = checkPlan(d, plan);
  if (typeof qty === "string") return { error: qty };
  if (!(Number.isFinite(feePct) && feePct >= 0)) return { error: "invalid_fee" };
  const holding = (reinvestRate: number, p: Plan): Holding => ({
    qty,
    dirtyPrice: d.dirtyPrice,
    accruedPaid: issue.accrued ?? d.accrued,
    nominal: issue.nominal,
    today: parseIsoDate(market.valuationDate) as number,
    periodDays: issue.periodDays,
    reinvestRate,
    exitYield: d.ytmMaturity,
    commissionPct: feePct,
    plan: p,
  });

  const heldPlan: Plan = { ...plan, reinvest: false };
  const trace = (flows: Schedule, ytm: number): YieldTrace => {
    const eventDay = flows.days.length > 0 ? (flows.days[flows.days.length - 1] as number) : 0;
    const traced = flows.days.map((day, i): FlowTrace => {
      const years = day / YEAR;
      const coupon = flows.coupons[i] as number;
      const principal = flows.principals[i] as number;
      const amount = coupon + principal;
      const factor = Math.pow(1 + ytm, -years);
      return { day, years, coupon, principal, amount, factor, presentValue: amount * factor };
    });
    let presentValue = 0;
    for (const f of traced) presentValue += f.presentValue;
    const priceWithFee = d.dirtyPrice * (1 + feePct / 100);
    const { breakdown: held, years: tax } = breakdownOf(holding(0, heldPlan), flows, eventDay, { shiftPct: 0 });
    return {
      eventDay,
      flows: traced,
      ytm,
      presentValue,
      priceWithFee,
      ytmAfterFee: ytm_effective(amountsOf(flows), flows.days, priceWithFee),
      held,
      tax,
    };
  };

  const { breakdown: planBreakdown, years: planTax } = breakdownOf(holding(plan.reinvest ? d.ytmMaturity : 0, plan), d.flows, plan.horizonDay, {
    shiftPct: 0,
  });
  return {
    ok: {
      feePct,
      price: {
        nominal: issue.nominal,
        cleanPct: issue.pricePct,
        clean: (issue.nominal * issue.pricePct) / 100,
        couponRatePct: d.ratesPct[0] ?? 0,
        periodDays: issue.periodDays,
        couponAmount: d.couponAmount,
        daysSinceLast: d.daysSinceLast,
        accruedComputed: d.accrued,
        accruedQuoted: issue.accrued,
        accrued: issue.accrued ?? d.accrued,
        dirty: d.dirtyPrice,
      },
      toMaturity: trace(d.flows, d.ytmMaturity),
      toOffer: d.flowsToOffer !== null && d.ytmOffer !== null ? trace(d.flowsToOffer, d.ytmOffer) : null,
      plan: planBreakdown,
      planTax,
    },
  };
}
