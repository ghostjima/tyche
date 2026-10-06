// What the screen asks of an engine. Both implementations of tyche-yield
// satisfy it: the Rust build in WebAssembly (the default) and the
// TypeScript twin (used when WebAssembly cannot load, and selectable in the
// diagnostics). Inputs and outputs are plain objects in the twin's shapes;
// errors are codes, returned as values.
import type { Calculation, Derived, ErrorCode, Explanation, Issue, Market, Plan, Result } from "@tyche/yield-twin";

export type { Calculation, Derived, ErrorCode, Explanation, Issue, Market, Plan, Result };
export type { Breakdown, FlowTrace, TaxRegime, TaxYear, YieldTrace } from "@tyche/yield-twin";

export type EngineKind = "wasm" | "twin";

export type Engine = {
  kind: EngineKind;
  derive_bond(issue: Issue, market: Market): Result<Derived>;
  calculate(issue: Issue, market: Market, plan: Plan): Result<Calculation>;
  /** The working behind the figures, for a plan and a broker's fee in
   * percent of each trade. */
  explain(issue: Issue, market: Market, plan: Plan, feePct: number): Result<Explanation>;
  /** Dirty price of a bond from its flows at an annual effective yield
   * (a fraction). */
  price_from_yield(amounts: number[], days: number[], y: number): number;
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
];
