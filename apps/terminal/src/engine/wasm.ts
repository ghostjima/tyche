// The WebAssembly build of tyche-yield behind the Engine contract: plain
// objects in, wasm-bindgen structs across the boundary, plain objects out.
// Every struct read from a result is a copy and is freed here; arrays come
// back as Float64Array and are turned into plain arrays, so both engines
// hand the screen the same shapes.
import init, * as glue from "tyche-yield";
import type { Breakdown, Calculation, Curve, Derived, Engine, ErrorCode, Explanation, GSpread, GSpreads, Issue, Market, Order, Plan, PortfolioYear, Result, TaxYear, Ticket, YieldTrace } from "./types";

type Schedule = Derived["flows"];

function issueOf(x: Issue): glue.Issue {
  const i = new glue.Issue();
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
}

function marketOf(x: Market): glue.Market {
  const m = new glue.Market();
  m.valuationDate = x.valuationDate;
  m.keyRatePct = x.keyRatePct;
  return m;
}

function planOf(x: Plan): glue.Plan {
  const p = new glue.Plan();
  p.amount = x.amount;
  p.horizonDay = x.horizonDay;
  p.reinvest = x.reinvest;
  p.taxRegime = x.taxRegime;
  p.otherIncome = x.otherIncome;
  p.rateShiftPct = x.rateShiftPct;
  return p;
}

function orderOf(x: Order): glue.Order {
  const o = new glue.Order();
  o.side = x.side;
  o.limit = x.limit;
  o.limitValue = x.limitValue;
  o.lots = x.lots;
  o.lotSize = x.lotSize;
  o.tickPct = x.tickPct;
  o.feePct = x.feePct;
  return o;
}

/** A curve crosses by value: the call consumes it, so it is made for
 * each call and not freed here. */
function curveOf(x: Curve): glue.Curve {
  const c = new glue.Curve();
  c.termsYears = Float64Array.from(x.termsYears);
  c.yieldsPct = Float64Array.from(x.yieldsPct);
  return c;
}

const list = (a: Float64Array): number[] => Array.from(a);

function gSpread(g: glue.GSpread): GSpread {
  const out: GSpread = {
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
}

function gSpreads(s: glue.GSpreads): GSpreads {
  const toOffer = s.toOffer;
  const out: GSpreads = { toMaturity: gSpread(s.toMaturity), toOffer: toOffer === undefined ? null : gSpread(toOffer) };
  s.free();
  return out;
}

function schedule(s: glue.Schedule): Schedule {
  const out = { days: list(s.days), coupons: list(s.coupons), principals: list(s.principals) };
  s.free();
  return out;
}

function breakdown(b: glue.Breakdown): Breakdown {
  const out: Breakdown = {
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
}

function derived(d: glue.Derived): Derived {
  const toOffer = d.flowsToOffer;
  const out: Derived = {
    maturityDay: d.maturityDay,
    couponDays: list(d.couponDays),
    ratesPct: list(d.ratesPct),
    amortDays: list(d.amortDays),
    amortFracs: list(d.amortFracs),
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
    event: d.event === "offer" ? "offer" : "maturity",
    eventDay: d.eventDay,
    yieldEvent: d.yieldEvent,
    macaulay: d.macaulay,
    modified: d.modified,
  };
  d.free();
  return out;
}

function calculation(c: glue.Calculation): Calculation {
  const e = c.earlyExit;
  const f = c.floater;
  const o = c.offer;
  const out: Calculation = {
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
            days: list(f.days),
            scenarios: f.scenarios.map((s) => {
              const r = { shiftPct: s.shiftPct, breakdown: breakdown(s.breakdown), coupons: list(s.coupons) };
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
}

function taxYear(t: glue.TaxYear): TaxYear {
  const out: TaxYear = {
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
}

function yieldTrace(y: glue.YieldTrace): YieldTrace {
  const out: YieldTrace = {
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
}

function explanation(e: glue.Explanation): Explanation {
  const p = e.price;
  const toOffer = e.toOffer;
  const out: Explanation = {
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
}

function ticket(t: glue.Ticket): Ticket {
  const out: Ticket = {
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
    event: t.event === "offer" ? "offer" : "maturity",
    eventDay: t.eventDay,
    yieldEvent: t.yieldEvent,
    yieldEventAfterFee: t.yieldEventAfterFee,
  };
  t.free();
  return out;
}

function portfolioYear(y: glue.PortfolioYear): PortfolioYear {
  const out: PortfolioYear = {
    year: y.year,
    holdings: y.holdings,
    income: y.income,
    result: y.result,
    relieved: y.relieved,
    relievedProceeds: y.relievedProceeds,
    relievedYears: y.relievedYears,
    reliefCap: y.reliefCap,
    exempt: y.exempt,
    base: y.base,
    taxedLow: y.taxedLow,
    taxedHigh: y.taxedHigh,
    tax: y.tax,
  };
  y.free();
  return out;
}

function portfolio(p: glue.Portfolio): PortfolioYear[] {
  const out = p.years.map(portfolioYear);
  p.free();
  return out;
}

function result<R extends { ok: unknown; error: string | undefined; free(): void }, T>(
  r: R,
  convert: (ok: NonNullable<R["ok"]>) => T,
): Result<T> {
  const ok = r.ok as R["ok"] | undefined;
  const out: Result<T> = ok === undefined || ok === null ? { error: r.error as ErrorCode } : { ok: convert(ok as NonNullable<R["ok"]>) };
  r.free();
  return out;
}

export const wasmEngine: Engine = {
  kind: "wasm",
  derive_bond(issue, market) {
    const i = issueOf(issue);
    const m = marketOf(market);
    const out = result(glue.derive_bond(i, m), derived);
    i.free();
    m.free();
    return out;
  },
  calculate(issue, market, plan, feePct) {
    const i = issueOf(issue);
    const m = marketOf(market);
    const p = planOf(plan);
    const out = result(glue.calculate(i, m, p, feePct), calculation);
    i.free();
    m.free();
    p.free();
    return out;
  },
  explain(issue, market, plan, feePct, curve) {
    const i = issueOf(issue);
    const m = marketOf(market);
    const p = planOf(plan);
    const out = result(glue.explain(i, m, p, feePct, curveOf(curve)), explanation);
    i.free();
    m.free();
    p.free();
    return out;
  },
  g_spread(issue, market, curve) {
    const i = issueOf(issue);
    const m = marketOf(market);
    const out = result(glue.g_spread(i, m, curveOf(curve)), gSpreads);
    i.free();
    m.free();
    return out;
  },
  order_ticket(issue, market, order) {
    const i = issueOf(issue);
    const m = marketOf(market);
    const o = orderOf(order);
    const out = result(glue.order_ticket(i, m, o), ticket);
    i.free();
    m.free();
    o.free();
    return out;
  },
  price_from_yield(amounts, days, y) {
    return glue.price_from_yield(Float64Array.from(amounts), Float64Array.from(days), y);
  },
  ytm_effective(amounts, days, price) {
    return glue.ytm_effective(Float64Array.from(amounts), Float64Array.from(days), price);
  },
  portfolio_tax(holdings, otherIncome) {
    // The holdings' tax years cross as six lists, one holding's year at
    // each index.
    const field = (k: "year" | "income" | "result" | "relieved" | "relievedProceeds" | "relievedYears") => Float64Array.from(holdings, (h) => h[k]);
    return result(
      glue.portfolio_tax(field("year"), field("income"), field("result"), field("relieved"), field("relievedProceeds"), field("relievedYears"), otherIncome),
      portfolio,
    );
  },
};

/** Fetches, compiles and instantiates the module; resolves with the
 * engine and the time that took, in milliseconds. */
export async function loadWasm(input?: Parameters<typeof init>[0]): Promise<{ engine: Engine; ms: number }> {
  const t0 = performance.now();
  await init(input === undefined ? undefined : input);
  return { engine: wasmEngine, ms: performance.now() - t0 };
}
