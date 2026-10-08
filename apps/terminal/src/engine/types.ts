// What the screen asks of an engine. Both implementations of tyche-yield
// satisfy it: the Rust build in WebAssembly (the default) and the
// TypeScript twin (used when WebAssembly cannot load, and selectable in the
// diagnostics). Inputs and outputs are plain objects in the twin's shapes;
// errors are codes, returned as values.
import type { Calculation, Curve, Derived, ErrorCode, Explanation, GSpreads, HoldingYear, Issue, Market, Plan, PortfolioYear, Result } from "@tyche/yield-twin";

export type { Calculation, Curve, Derived, ErrorCode, Explanation, GSpreads, HoldingYear, Issue, Market, Plan, PortfolioYear, Result };
export type { Breakdown, FlowTrace, GSpread, Schedule, TaxRegime, TaxYear, YieldTrace } from "@tyche/yield-twin";

export type EngineKind = "wasm" | "twin";

export type Engine = {
  kind: EngineKind;
  derive_bond(issue: Issue, market: Market): Result<Derived>;
  /** A plan with a broker's fee in percent of each trade. */
  calculate(issue: Issue, market: Market, plan: Plan, feePct: number): Result<Calculation>;
  /** The working behind the figures, for a plan, a broker's fee in
   * percent of each trade and the zero-coupon curve the G-spreads are
   * taken against. */
  explain(issue: Issue, market: Market, plan: Plan, feePct: number, curve: Curve): Result<Explanation>;
  /** The G-spreads of the yields to maturity and to the offer to the
   * zero-coupon curve, at their Macaulay durations. */
  g_spread(issue: Issue, market: Market, curve: Curve): Result<GSpreads>;
  /** Dirty price of a bond from its flows at an annual effective yield
   * (a fraction). */
  price_from_yield(amounts: number[], days: number[], y: number): number;
  /** The annual effective yield (a fraction) at which flows are worth a
   * price; NaN with no flows or a price that is not positive. */
  ytm_effective(amounts: number[], days: number[], price: number): number;
  /** The tax of several holdings together, year by year: their tax years
   * (as explain gives them) in one base per calendar year, with the
   * holder's other investment income. */
  portfolio_tax(holdings: readonly HoldingYear[], otherIncome: number): Result<PortfolioYear[]>;
};

/** Every code the engine can return, in its documented order of checks. */
export const ERROR_CODES: readonly ErrorCode[] = [
  "invalid_code",
  "invalid_date",
  "invalid_nominal",
  "invalid_period",
  "matured",
  "amount_not_positive",
  "amount_too_large",
  "horizon_out_of_range",
  "invalid_other_income",
  "invalid_price",
  "amount_below_one_bond",
  "invalid_fee",
  "curve_missing",
  "invalid_curve",
  "invalid_quantity",
  "invalid_limit",
  "invalid_tick",
  "price_off_tick",
  "invalid_tax_year",
];
