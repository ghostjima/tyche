// The order ticket's rules that are the app's own: the order the engine is
// given, which field an engine error belongs under, the price steps
// around a price off the step, the size a ticket starts with, and the
// qualification gate's verdict for the investor's status and the order's
// side. The figures themselves are the engine's order_ticket; the depth
// check is tyche-market's.
import type { Access } from "../data/issues";
import type { OrderSide } from "../data/depth";
import { UNITS_PER_PCT } from "../data/depth";
import type { ErrorCode, LimitKind, Order, Ticket } from "../engine/types";
import { BONDS_MAX } from "./holdings";

/** A price shown and typed to the book's unit, 0.0001 percent of face, so
 * a price off a coarser step can be typed and is said to be off it. */
export const PRICE_DECIMALS = 4;
export const YIELD_DECIMALS = 2;

/** The order the engine is given for a limit and a size. */
export function ticketOrder(o: { side: OrderSide; limit: LimitKind; limitValue: number; lots: number; lotSize: number; tickPct: number; feePct: number }): Order {
  return { side: o.side, limit: o.limit, limitValue: o.limitValue, lots: o.lots, lotSize: o.lotSize, tickPct: o.tickPct, feePct: o.feePct };
}

/** Where an engine error is said: under the limit (price or yield, the
 * one typed), under the lots, by the broker's fee, or for the issue as a
 * whole. */
export type TicketField = "limit" | "lots" | "fee" | "issue";

export function fieldOf(code: ErrorCode): TicketField {
  switch (code) {
    case "invalid_quantity":
      return "lots";
    case "invalid_limit":
    case "invalid_tick":
    case "price_off_tick":
      return "limit";
    case "invalid_fee":
      return "fee";
    default:
      return "issue";
  }
}

/** The prices on the step just below and just above a price, in percent
 * of face; the same price twice when it is on the step. */
export function stepsAround(pricePct: number, tickPct: number): [number, number] {
  const units = Math.round(pricePct * UNITS_PER_PCT);
  const tick = Math.round(tickPct * UNITS_PER_PCT);
  if (tick <= 0) return [pricePct, pricePct];
  const below = Math.floor(units / tick) * tick;
  const above = below === units ? below : below + tick;
  return [below / UNITS_PER_PCT, above / UNITS_PER_PCT];
}

/** The lots a ticket starts with: ten bonds' worth for an issue traded in
 * single bonds, one lot otherwise. */
export const defaultLots = (lotSize: number): number => Math.max(1, Math.round(10 / lotSize));

/** The most lots a ticket takes: up to the holdings' limit in bonds. */
export const maxLots = (lotSize: number): number => Math.max(1, Math.floor(BONDS_MAX / lotSize));

/** What the investor says the broker has on record: not a qualified
 * investor, the same with the test for this kind of bond passed, or a
 * qualified investor. */
export const INVESTOR_STATUSES = ["unqualified", "tested", "qualified"] as const;
export type InvestorStatus = (typeof INVESTOR_STATUSES)[number];

/** The gate's verdict: whether the order may go on to its confirmation,
 * and why. A sale is never held: the rules restrict who may buy. */
export type GateVerdict =
  | { allowed: true; why: "sell" | "open" | "tested" | "qualified" }
  | { allowed: false; why: "needs_test" | "qualified_only" };

export function gateVerdict(access: Access, status: InvestorStatus, side: OrderSide): GateVerdict {
  if (side === "sell") return { allowed: true, why: "sell" };
  switch (access) {
    case "open":
      return { allowed: true, why: "open" };
    case "test":
      if (status === "qualified") return { allowed: true, why: "qualified" };
      return status === "tested" ? { allowed: true, why: "tested" } : { allowed: false, why: "needs_test" };
    case "qualified":
      return status === "qualified" ? { allowed: true, why: "qualified" } : { allowed: false, why: "qualified_only" };
  }
}

/** An amount in roubles to the kopeck. */
const kopecks = (x: number): number => Math.round(x * 100) / 100;

/** The order's amounts as the ticket shows them, each to the kopeck, so
 * what is shown adds up: the amount is the clean amount and the accrued
 * interest shown, and the total is the amount and the fee shown (less the
 * fee for a sale). The engine's own total differs by a kopeck or two at most. */
export function shownAmounts(t: Ticket, side: OrderSide): { clean: number; accrued: number; amount: number; fee: number; total: number } {
  const clean = kopecks(t.cleanAmount);
  const accrued = kopecks(t.accruedAmount);
  const amount = kopecks(clean + accrued);
  const fee = kopecks(t.fee);
  return { clean, accrued, amount, fee, total: kopecks(side === "buy" ? amount + fee : amount - fee) };
}
