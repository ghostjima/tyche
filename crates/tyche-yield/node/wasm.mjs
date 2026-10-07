// Loads the wasm-pack build in pkg/ under Node and wraps derive_bond,
// calculate, explain, g_spread and order_ticket so they take and return the same plain
// objects as the twin.
// Also the reference for using the structs from JavaScript.

import { readFileSync } from "node:fs";

const PKG = new URL("../pkg/", import.meta.url);

export async function loadWasm() {
  const glue = await import(new URL("tyche_yield.js", PKG).href);
  glue.initSync({ module: readFileSync(new URL("tyche_yield_bg.wasm", PKG)) });
  return glue;
}

// The wasm build behind the twin's API: plain objects in, plain objects
// out (arrays come back as Float64Array), every wasm object freed.
export function wrap(w) {
  const issueOf = (x) => {
    const i = new w.Issue();
    i.nominal = x.nominal;
    i.pricePct = x.pricePct;
    i.accrued = x.accrued ?? undefined;
    i.couponType = x.couponType;
    i.couponRatePct = x.couponRatePct;
    i.spreadPct = x.spreadPct;
    i.periodDays = x.periodDays;
    i.maturity = x.maturity;
    i.offers = x.offers;
    i.amortDates = x.amortization.map((a) => a.date);
    i.amortFractionsPct = Float64Array.from(x.amortization, (a) => a.fractionPct);
    return i;
  };
  const marketOf = (x) => {
    const m = new w.Market();
    m.valuationDate = x.valuationDate;
    m.keyRatePct = x.keyRatePct;
    return m;
  };
  const planOf = (x) => {
    const p = new w.Plan();
    p.amount = x.amount;
    p.horizonDay = x.horizonDay;
    p.reinvest = x.reinvest;
    p.taxRegime = x.taxRegime;
    p.otherIncome = x.otherIncome;
    p.rateShiftPct = x.rateShiftPct;
    return p;
  };
  // A curve crosses by value: the call consumes the wasm object, so it is
  // made for each call and never freed here. null or undefined stays
  // undefined, which the engine reports as curve_missing.
  const curveOf = (x) => {
    if (x === null || x === undefined) return undefined;
    const c = new w.Curve();
    c.termsYears = Float64Array.from(x.termsYears);
    c.yieldsPct = Float64Array.from(x.yieldsPct);
    return c;
  };
  const gSpread = (g) => {
    const out = {
      durationYears: g.durationYears,
      yieldPct: g.yieldPct,
      termBelowYears: g.termBelowYears,
      yieldBelowPct: g.yieldBelowPct,
      termAboveYears: g.termAboveYears,
      yieldAbovePct: g.yieldAbovePct,
      curvePct: g.curvePct,
      spreadBp: g.spreadBp,
    };
    g.free();
    return out;
  };
  const gSpreads = (s) => {
    const toOffer = s.toOffer;
    const out = { toMaturity: gSpread(s.toMaturity), toOffer: toOffer === undefined ? null : gSpread(toOffer) };
    s.free();
    return out;
  };
  const orderOf = (x) => {
    const o = new w.Order();
    o.side = x.side;
    o.limit = x.limit;
    o.limitValue = x.limitValue;
    o.lots = x.lots;
    o.lotSize = x.lotSize;
    o.tickPct = x.tickPct;
    o.feePct = x.feePct;
    return o;
  };
  const ticket = (t) => {
    const out = {
      bonds: t.bonds,
      cleanPct: t.cleanPct,
      clean: t.clean,
      accrued: t.accrued,
      dirty: t.dirty,
      cleanAmount: t.cleanAmount,
      accruedAmount: t.accruedAmount,
      amount: t.amount,
      fee: t.fee,
      total: t.total,
      ytmMaturity: t.ytmMaturity,
      ytmOffer: t.ytmOffer ?? null,
      event: t.event,
      eventDay: t.eventDay,
      yieldEvent: t.yieldEvent,
      yieldEventAfterFee: t.yieldEventAfterFee,
    };
    t.free();
    return out;
  };
  const schedule = (s) => {
    const out = { days: s.days, coupons: s.coupons, principals: s.principals };
    s.free();
    return out;
  };
  const breakdown = (b) => {
    const out = {
      qty: b.qty,
      invested: b.invested,
      coupons: b.coupons,
      reinvest: b.reinvest,
      amort: b.amort,
      body: b.body,
      tax: b.tax,
      commission: b.commission,
      total: b.total,
      profit: b.profit,
      periodPct: b.periodPct,
      annualPct: b.annualPct ?? null,
      horizonDay: b.horizonDay,
    };
    b.free();
    return out;
  };
  const derived = (d) => {
    const toOffer = d.flowsToOffer;
    const out = {
      maturityDay: d.maturityDay,
      couponDays: d.couponDays,
      ratesPct: d.ratesPct,
      amortDays: d.amortDays,
      amortFracs: d.amortFracs,
      daysSinceLast: d.daysSinceLast,
      couponAmount: d.couponAmount,
      accrued: d.accrued,
      dirtyPrice: d.dirtyPrice,
      flows: schedule(d.flows),
      flowsToOffer: toOffer === undefined ? null : schedule(toOffer),
      offerDay: d.offerDay ?? null,
      ytmMaturity: d.ytmMaturity,
      ytmOffer: d.ytmOffer ?? null,
      ytmSimple: d.ytmSimple,
      event: d.event,
      eventDay: d.eventDay,
      yieldEvent: d.yieldEvent,
      macaulay: d.macaulay,
      modified: d.modified,
    };
    d.free();
    return out;
  };
  const calculation = (c) => {
    const e = c.earlyExit;
    const f = c.floater;
    const o = c.offer;
    const out = {
      plan: breakdown(c.plan),
      earlyExit: {
        rateShiftPct: e.rateShiftPct,
        applicable: e.applicable,
        result: breakdown(e.result),
        diff: e.diff,
        modDurationAtHorizon: e.modDurationAtHorizon ?? null,
      },
      floater:
        f === undefined
          ? null
          : {
              days: f.days,
              scenarios: f.scenarios.map((s) => {
                const r = { shiftPct: s.shiftPct, breakdown: breakdown(s.breakdown), coupons: s.coupons };
                s.free();
                return r;
              }),
            },
      offer: o === undefined ? null : { before: breakdown(o.before), after: breakdown(o.after) },
    };
    e.free();
    f?.free();
    o?.free();
    c.free();
    return out;
  };
  const taxYear = (t) => {
    const out = {
      year: t.year,
      coupons: t.coupons,
      accruedPaid: t.accruedPaid,
      accruedReceived: t.accruedReceived,
      redemptions: t.redemptions,
      sale: t.sale,
      cost: t.cost,
      reinvest: t.reinvest,
      income: t.income,
      result: t.result,
      relieved: t.relieved,
      relievedProceeds: t.relievedProceeds,
      relievedYears: t.relievedYears,
      exempt: t.exempt,
      base: t.base,
      taxedLow: t.taxedLow,
      taxedHigh: t.taxedHigh,
      tax: t.tax,
    };
    t.free();
    return out;
  };
  const yieldTrace = (y) => {
    const out = {
      eventDay: y.eventDay,
      flows: y.flows.map((f) => {
        const r = { day: f.day, years: f.years, coupon: f.coupon, principal: f.principal, amount: f.amount, factor: f.factor, presentValue: f.presentValue };
        f.free();
        return r;
      }),
      ytm: y.ytm,
      presentValue: y.presentValue,
      priceWithFee: y.priceWithFee,
      ytmAfterFee: y.ytmAfterFee,
      gSpread: gSpread(y.gSpread),
      held: breakdown(y.held),
      tax: y.tax.map(taxYear),
    };
    y.free();
    return out;
  };
  const explanation = (e) => {
    const p = e.price;
    const toOffer = e.toOffer;
    const out = {
      feePct: e.feePct,
      price: {
        nominal: p.nominal,
        cleanPct: p.cleanPct,
        clean: p.clean,
        couponRatePct: p.couponRatePct,
        periodDays: p.periodDays,
        couponAmount: p.couponAmount,
        daysSinceLast: p.daysSinceLast,
        accruedComputed: p.accruedComputed,
        accruedQuoted: p.accruedQuoted ?? null,
        accrued: p.accrued,
        dirty: p.dirty,
      },
      toMaturity: yieldTrace(e.toMaturity),
      toOffer: toOffer === undefined ? null : yieldTrace(toOffer),
      plan: breakdown(e.plan),
      planTax: e.planTax.map(taxYear),
    };
    p.free();
    e.free();
    return out;
  };
  const result = (r, convert) => {
    const ok = r.ok;
    const out = ok === undefined ? { error: r.error } : { ok: convert(ok) };
    r.free();
    return out;
  };
  return {
    derive_bond: (issue, market) => {
      const i = issueOf(issue);
      const m = marketOf(market);
      const out = result(w.derive_bond(i, m), derived);
      i.free();
      m.free();
      return out;
    },
    explain: (issue, market, plan, feePct, curve) => {
      const i = issueOf(issue);
      const m = marketOf(market);
      const p = planOf(plan);
      const out = result(w.explain(i, m, p, feePct, curveOf(curve)), explanation);
      i.free();
      m.free();
      p.free();
      return out;
    },
    g_spread: (issue, market, curve) => {
      const i = issueOf(issue);
      const m = marketOf(market);
      const out = result(w.g_spread(i, m, curveOf(curve)), gSpreads);
      i.free();
      m.free();
      return out;
    },
    order_ticket: (issue, market, order) => {
      const i = issueOf(issue);
      const m = marketOf(market);
      const o = orderOf(order);
      const out = result(w.order_ticket(i, m, o), ticket);
      i.free();
      m.free();
      o.free();
      return out;
    },
    calculate: (issue, market, plan, feePct) => {
      const i = issueOf(issue);
      const m = marketOf(market);
      const p = planOf(plan);
      const out = result(w.calculate(i, m, p, feePct), calculation);
      i.free();
      m.free();
      p.free();
      return out;
    },
  };
}
