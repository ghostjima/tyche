/*
  order_ticket: the yield at a limit price, or the price at a limit yield,
  for a number of lots, with the accrued interest the buyer pays and the
  broker's fee. A limit yield is to the nearest event (the offer when there
  is one), as the issue's quoted yield is.
*/

import { derive_bond, amountsOf } from "./issue.js";
import { price_from_yield, ytm_effective } from "./primitives.js";
import type { Issue, Market, Order, Result, Ticket } from "./types.js";

/* How far from a whole number of price steps a price may be, in steps */
const ON_TICK = 1e-9;

const whole = (x: number) => Number.isFinite(x) && x >= 1 && Number.isInteger(x);

/*
  Errors in order: invalid_code (side or limit, then derive_bond's own),
  derive_bond's, invalid_quantity, invalid_limit, invalid_tick, price_off_tick, invalid_fee
*/
export function order_ticket(issue: Issue, market: Market, order: Order): Result<Ticket> {
  // Codes before anything else, as the engine's JavaScript boundary reads them.
  if ((order.side !== "buy" && order.side !== "sell") || (order.limit !== "price" && order.limit !== "yield")) {
    return { error: "invalid_code" };
  }
  const derived = derive_bond(issue, market);
  if ("error" in derived) return derived;
  const d = derived.ok;
  if (!whole(order.lots) || !whole(order.lotSize)) return { error: "invalid_quantity" };
  const accrued = issue.accrued ?? d.accrued;
  const tick = order.tickPct;
  const tickOk = Number.isFinite(tick) && tick >= 0;
  const eventFlows = d.flowsToOffer ?? d.flows;
  let cleanPct: number;
  if (order.limit === "price") {
    const p = order.limitValue;
    if (!(Number.isFinite(p) && p > 0)) return { error: "invalid_limit" };
    if (!tickOk) return { error: "invalid_tick" };
    if (tick > 0) {
      const steps = p / tick;
      // Math.round takes a half up where Rust's round takes it away from
      // zero; steps are positive here, so the two agree.
      if (Math.abs(steps - Math.round(steps)) > ON_TICK) return { error: "price_off_tick" };
    }
    cleanPct = p;
  } else {
    const y = order.limitValue;
    if (!(Number.isFinite(y) && y > -99)) return { error: "invalid_limit" };
    const dirty = price_from_yield(amountsOf(eventFlows), eventFlows.days, y / 100);
    const exact = ((dirty - accrued) / issue.nominal) * 100;
    if (!(Number.isFinite(exact) && exact > 0)) return { error: "invalid_limit" };
    if (!tickOk) return { error: "invalid_tick" };
    if (tick === 0) cleanPct = exact;
    else {
      // Down for a buy, up for a sell, so neither side gets less than the yield it set.
      const steps = order.side === "buy" ? Math.floor(exact / tick + ON_TICK) : Math.ceil(exact / tick - ON_TICK);
      if (steps < 1) return { error: "invalid_limit" };
      cleanPct = steps * tick;
    }
  }
  if (!(Number.isFinite(order.feePct) && order.feePct >= 0)) return { error: "invalid_fee" };

  const bonds = order.lots * order.lotSize;
  const clean = (issue.nominal * cleanPct) / 100;
  const dirty = clean + accrued;
  const amount = bonds * dirty;
  const fee = (amount * order.feePct) / 100;
  const ytmMaturity = ytm_effective(amountsOf(d.flows), d.flows.days, dirty);
  const ytmOffer = d.flowsToOffer === null ? null : ytm_effective(amountsOf(d.flowsToOffer), d.flowsToOffer.days, dirty);
  const afterFee = order.side === "buy" ? dirty * (1 + order.feePct / 100) : dirty * (1 - order.feePct / 100);
  return {
    ok: {
      bonds,
      cleanPct,
      clean,
      accrued,
      dirty,
      cleanAmount: bonds * clean,
      accruedAmount: bonds * accrued,
      amount,
      fee,
      total: order.side === "buy" ? amount + fee : amount - fee,
      ytmMaturity,
      ytmOffer,
      event: d.event,
      eventDay: d.eventDay,
      yieldEvent: ytmOffer ?? ytmMaturity,
      yieldEventAfterFee: ytm_effective(amountsOf(eventFlows), eventFlows.days, afterFee),
    },
  };
}
