// The WebAssembly build of tyche-yield behind the Engine contract: plain
// objects in, wasm-bindgen structs across the boundary, plain objects out.
// Every struct read from a result is a copy and is freed here; arrays come
// back as Float64Array and are turned into plain arrays, so both engines
// hand the screen the same shapes.
import init, * as glue from "tyche-yield";
import type { Breakdown, Calculation, Derived, Engine, ErrorCode, Issue, Market, Plan, Result } from "./types";

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

const list = (a: Float64Array): number[] => Array.from(a);

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
  calculate(issue, market, plan) {
    const i = issueOf(issue);
    const m = marketOf(market);
    const p = planOf(plan);
    const out = result(glue.calculate(i, m, p), calculation);
    i.free();
    m.free();
    p.free();
    return out;
  },
  price_from_yield(amounts, days, y) {
    return glue.price_from_yield(Float64Array.from(amounts), Float64Array.from(days), y);
  },
};

/** Fetches, compiles and instantiates the module; resolves with the
 * engine and the time that took, in milliseconds. */
export async function loadWasm(input?: Parameters<typeof init>[0]): Promise<{ engine: Engine; ms: number }> {
  const t0 = performance.now();
  await init(input === undefined ? undefined : input);
  return { engine: wasmEngine, ms: performance.now() - t0 };
}
