// A ladder: an amount spread over issues whose exits (a put offer the
// holder can take, or maturity) fall one in each year of a horizon, so
// money comes back year by year. The terminal proposes the issues from
// the list the person's filters leave; the person can change each one.
// Everything is kept in the URL: `?lh=` years, `?la=` the amount, `?lr=`
// a rung's issue once per rung, in order ("-" for a rung left empty).
//
// The figures come from the engine: each rung held to its exit with
// nothing reinvested, after the broker's fee (`explain`); the tax of the
// rungs together, their tax years in one base per calendar year
// (`portfolio_tax`); and the ladder's yield, the engine's yield
// (`ytm_effective`) of what the rungs bring at their exits less each
// year's tax, against what they cost.
import type { Access } from "../data/issues";
import type { Breakdown, Engine, Explanation, Market, Curve, Plan, PortfolioYear, Schedule, TaxYear } from "../engine/types";
import type { Item } from "./filters";

export const LADDER_YEARS = { min: 1, max: 10 } as const;
export const LADDER_AMOUNT = { min: 10_000, max: 100_000_000 } as const;
export const LADDER_DEFAULT = { years: 3, amount: 1_000_000 } as const;
const YEAR = 365;

export type LadderParams = { years: number; amount: number; picks: (string | null)[] };

const whole = (x: number, lo: number, hi: number) => Number.isInteger(x) && x >= lo && x <= hi;

/** The ladder in the URL, or null when there is none (no `?lh=`). A value
 * out of range falls back to the default. */
export function readLadder(params: URLSearchParams): LadderParams | null {
  if (!params.has("lh")) return null;
  const years = Number(params.get("lh"));
  const amount = Number(params.get("la"));
  return {
    years: whole(years, LADDER_YEARS.min, LADDER_YEARS.max) ? years : LADDER_DEFAULT.years,
    amount: whole(amount, LADDER_AMOUNT.min, LADDER_AMOUNT.max) ? amount : LADDER_DEFAULT.amount,
    picks: params.getAll("lr").map((x) => (x === "-" || x === "" ? null : x)),
  };
}

/** Writes the ladder to the URL, or takes it out for null. */
export function writeLadder(params: URLSearchParams, ladder: LadderParams | null): void {
  for (const k of ["lh", "la", "lr"]) params.delete(k);
  if (!ladder) return;
  params.set("lh", String(ladder.years));
  params.set("la", String(ladder.amount));
  for (const p of ladder.picks) params.append("lr", p ?? "-");
}

/** The day the holder gets the money back: a put offer's day, else
 * maturity. */
export function exitDay(item: Item): number {
  return item.bond.offer?.kind === "put" && item.derived.offerDay !== null ? item.derived.offerDay : item.derived.maturityDay;
}

/** Why an issue is left out of a ladder, or null when it can be a rung:
 * not open to every investor; an inflation-linked issue, whose yield is
 * real; a call offer, where the issuer decides when the money comes back. */
export function excluded(item: Item, access: Access | undefined): "access" | "linker" | "call" | null {
  if (access !== "open") return "access";
  if (item.bond.coupon.kind === "linker") return "linker";
  if (item.bond.offer?.kind === "call") return "call";
  return null;
}

/** Rung k (from 0) of a ladder of `years`: exits after its start and up
 * to its end, in days from the valuation date. */
export function rungSpan(k: number): { from: number; to: number } {
  return { from: k * YEAR, to: (k + 1) * YEAR };
}

/** The issues that can fill each rung, the highest yield to the exit
 * first. */
export function candidates(items: readonly Item[], access: Map<string, Access>, years: number): Item[][] {
  const rungs: Item[][] = Array.from({ length: years }, () => []);
  for (const item of items) {
    if (excluded(item, access.get(item.bond.id)) !== null) continue;
    const day = exitDay(item);
    const k = Math.ceil(day / YEAR) - 1;
    if (k >= 0 && k < years && Number.isFinite(item.derived.yieldEvent)) rungs[k]!.push(item);
  }
  for (const r of rungs) r.sort((a, b) => b.derived.yieldEvent - a.derived.yieldEvent || a.bond.id.localeCompare(b.bond.id));
  return rungs;
}

/** Each rung's issue: the one picked when it can still fill the rung,
 * else the highest yield among the rung's candidates; null for a rung the
 * person emptied or with no candidate. */
export function chooseRungs(cands: Item[][], picks: readonly (string | null)[]): (Item | null)[] {
  return cands.map((list, k) => {
    const pick = picks[k];
    if (pick === null) return null;
    return list.find((i) => i.bond.id === pick) ?? list[0] ?? null;
  });
}

export type Rung = {
  item: Item;
  exit: number;
  /** Whether the exit is a put offer. */
  offer: boolean;
  /** Bonds bought: whole lots at the dirty price within the rung's share. */
  bonds: number;
  /** Held to the exit with nothing reinvested, after the fee; its `tax`
   * is the rung's tax on its own, which the ladder does not use. */
  held: Breakdown;
  /** Back at the exit after the fee, before tax: `held.total - held.tax`. */
  before: number;
  /** The rung's tax years, as explain traces them: what the ladder's tax
   * is built from. */
  tax: TaxYear[];
  /** The flows to the exit, per bond. */
  flows: Schedule;
};

export type LadderResult = {
  /** A rung worked out; one whose share does not buy a lot
   * (`below_lot`) or that the engine refuses (its code); or none. */
  rungs: (Rung | { item: Item; error: string } | null)[];
  invested: number;
  /** What the rungs bring at their exits after the fee, before tax. */
  before: number;
  /** The tax of the rungs together, year by year; empty with no rung. */
  taxYears: PortfolioYear[];
  /** The years' tax added up. */
  tax: number;
  /** `before - tax`. */
  received: number;
  /** The ladder's yield after tax and the fee, nothing reinvested: the
   * engine's annual effective yield of what the rungs bring at their exits,
   * less each year's tax on the ladder's last payment of that year, against
   * what they cost; NaN with no rung. */
  yieldAfter: number;
};

/** Works out a ladder: the amount split equally over the rungs with an
 * issue, whole lots bought at today's dirty price, each rung held to its
 * exit, the rungs taxed together in an ordinary brokerage account with no
 * other income. */
export function workLadder(engine: Engine, market: Market, curve: Curve, rungs: (Item | null)[], amount: number, feePct: number): LadderResult {
  const filled = rungs.filter((r) => r !== null).length;
  const share = filled > 0 ? amount / filled : 0;
  const out: LadderResult["rungs"] = [];
  for (const item of rungs) {
    if (!item) {
      out.push(null);
      continue;
    }
    const lot = item.bond.lot;
    const perLot = item.derived.dirtyPrice * lot;
    const bonds = Math.floor(share / perLot) * lot;
    if (bonds < 1) {
      out.push({ item, error: "below_lot" });
      continue;
    }
    const exit = exitDay(item);
    const offer = exit !== item.derived.maturityDay;
    // Half a bond over, so the engine's whole bonds are exactly these.
    const plan: Plan = { amount: (bonds + 0.5) * item.derived.dirtyPrice, horizonDay: exit, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 };
    const r = engine.explain(item.bond.issue, market, plan, feePct, curve);
    if (!("ok" in r)) {
      out.push({ item, error: r.error });
      continue;
    }
    const trace = pickTrace(r.ok, offer);
    out.push({
      item,
      exit,
      offer,
      bonds,
      held: trace.held,
      before: trace.held.total - trace.held.tax,
      tax: trace.tax,
      flows: offer && item.derived.flowsToOffer ? item.derived.flowsToOffer : item.derived.flows,
    });
  }
  const done = out.filter((r): r is Rung => r !== null && "held" in r);
  const invested = done.reduce((s, r) => s + r.held.invested, 0);
  const before = done.reduce((s, r) => s + r.before, 0);
  const t = engine.portfolio_tax(
    done.flatMap((r) => r.tax),
    0,
  );
  // The rungs' tax years come from the engine and are valid; were one
  // refused, the tax and the yield after it would be unknown, not zero.
  const taxYears = "ok" in t ? t.ok : [];
  const tax = "ok" in t ? taxYears.reduce((s, y) => s + y.tax, 0) : Number.NaN;
  const last = lastPaymentByYear(market.valuationDate, done);
  const owed = taxYears.filter((y) => y.tax > 0);
  const yieldAfter =
    done.length > 0 && Number.isFinite(tax)
      ? engine.ytm_effective(
          [...done.map((r) => r.before), ...owed.map((y) => -y.tax)],
          [...done.map((r) => r.exit), ...owed.map((y) => last.get(y.year) ?? Number.NaN)],
          invested,
        )
      : Number.NaN;
  return { rungs: out, invested, before, taxYears, tax, received: before - tax, yieldAfter };
}

/** Calendar year of a day offset from the valuation date. */
function yearOfDay(valuationDate: string, day: number): number {
  const [y0, m0, d0] = valuationDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y0, m0 - 1, d0) + day * 86_400_000).getUTCFullYear();
}

/** The day of the ladder's last payment in each calendar year, from the
 * rungs' flows to their exits: the day a year's tax is taken, as a broker
 * withholds it from payments. */
export function lastPaymentByYear(valuationDate: string, rungs: readonly Rung[]): Map<number, number> {
  const last = new Map<number, number>();
  for (const r of rungs) {
    for (const day of r.flows.days) {
      if (day > r.exit) continue;
      const year = yearOfDay(valuationDate, day);
      last.set(year, Math.max(last.get(year) ?? day, day));
    }
  }
  return last;
}

function pickTrace(e: Explanation, offer: boolean) {
  return offer && e.toOffer ? e.toOffer : e.toMaturity;
}

export type YearFlow = { year: number; coupons: number; principal: number };

/** The ladder's payments by calendar year, before tax: each rung's flows
 * to its exit times its bonds. */
export function flowsByYear(valuationDate: string, rungs: readonly Rung[]): YearFlow[] {
  const [y0, m0, d0] = valuationDate.split("-").map(Number) as [number, number, number];
  const start = Date.UTC(y0, m0 - 1, d0);
  const years = new Map<number, YearFlow>();
  for (const r of rungs) {
    r.flows.days.forEach((day, i) => {
      const year = new Date(start + day * 86_400_000).getUTCFullYear();
      const y = years.get(year) ?? { year, coupons: 0, principal: 0 };
      y.coupons += (r.flows.coupons[i] ?? 0) * r.bonds;
      y.principal += (r.flows.principals[i] ?? 0) * r.bonds;
      years.set(year, y);
    });
  }
  return [...years.values()].sort((a, b) => a.year - b.year);
}
