/*
  The G-spread: an issue's yield over the zero-coupon yield curve of federal
  loan bonds at the issue's Macaulay duration. The curve is the Bank of
  Russia's publication of the Moscow Exchange's curve: yields in percent a
  year, annual effective (Y = exp(G / 10000) - 1 of the Exchange's
  continuously compounded G, in basis points), at fixed terms in years. This
  engine's yields are annual effective too, so the spread is the plain
  difference. Between two published terms the curve is read linearly in the
  yield; before the first term and after the last it is held flat.
*/

import { curveBracket } from "./bracket.js";
import { amountsOf, derive_bond } from "./issue.js";
import { macaulay_duration } from "./primitives.js";
import type { Curve, ErrorCode, GSpread, GSpreads, Issue, Market, Result, Schedule } from "./types.js";

/*
  curve_missing for a curve that is null or undefined or has neither terms
  nor yields; invalid_curve when the two lists differ in length, a term is
  not a finite number above zero, the terms do not strictly ascend, or a
  yield is not a finite number
*/
export function checkCurve(curve: Curve | null | undefined): ErrorCode | null {
  if (curve === null || curve === undefined) return "curve_missing";
  const t = curve.termsYears;
  const y = curve.yieldsPct;
  if (t.length === 0 && y.length === 0) return "curve_missing";
  if (t.length !== y.length) return "invalid_curve";
  for (let i = 0; i < t.length; i++) {
    const term = t[i] as number;
    if (!(Number.isFinite(term) && term > 0)) return "invalid_curve";
    if (i > 0 && !((t[i - 1] as number) < term)) return "invalid_curve";
    if (!Number.isFinite(y[i] as number)) return "invalid_curve";
  }
  return null;
}

/* The G-spread of a yield (a fraction) to the event the flows end on; the curve is checked */
export function spreadOf(flows: Schedule, ytm: number, curve: Curve): GSpread {
  const durationYears = macaulay_duration(amountsOf(flows), flows.days, ytm);
  const yieldPct = ytm * 100;
  const t = curve.termsYears;
  const y = curve.yieldsPct;
  const b = curveBracket(t, durationYears);
  let below = [Number.NaN, Number.NaN];
  let above = [Number.NaN, Number.NaN];
  let curvePct = Number.NaN;
  if (b !== null) {
    const [lo, hi, w] = b;
    below = [t[lo] as number, y[lo] as number];
    above = [t[hi] as number, y[hi] as number];
    curvePct = lo === hi ? (y[lo] as number) : (y[lo] as number) + w * ((y[hi] as number) - (y[lo] as number));
  }
  return {
    durationYears,
    yieldPct,
    termBelowYears: below[0] as number,
    yieldBelowPct: below[1] as number,
    termAboveYears: above[0] as number,
    yieldAbovePct: above[1] as number,
    curvePct,
    spreadBp: (yieldPct - curvePct) * 100,
  };
}

/*
  The G-spreads of the yields to maturity and to the nearest offer, each at
  the Macaulay duration of its own flows. Errors as derive_bond, then the
  curve's
*/
export function g_spread(issue: Issue, market: Market, curve: Curve | null | undefined): Result<GSpreads> {
  const derived = derive_bond(issue, market);
  if ("error" in derived) return derived;
  const bad = checkCurve(curve);
  if (bad !== null) return { error: bad };
  const d = derived.ok;
  const c = curve as Curve;
  return {
    ok: {
      toMaturity: spreadOf(d.flows, d.ytmMaturity, c),
      toOffer: d.flowsToOffer !== null && d.ytmOffer !== null ? spreadOf(d.flowsToOffer, d.ytmOffer, c) : null,
    },
  };
}
