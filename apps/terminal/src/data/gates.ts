// Who may buy each issue of the synthetic universe, with the reasons, as
// tyche-market writes them (accessJson): anyone, a non-qualified investor
// after a passed test, or qualified investors only. The rule is the
// market engine's; the order ticket shows its verdict and its reasons
// before a confirmation.
import { RATINGS, type Access, type Rating } from "./issues";

/** Every reason tyche-market's rule gives: a subordinated issue is named
 * as such, or as a bank's subordinated issue, by the rule's revision. */
export const GATE_REASONS = ["qualified_only", "subordinated", "subordinated_bank", "rating_below_threshold", "government", "rating_at_threshold"] as const;
export type GateReason = (typeof GATE_REASONS)[number];

export type Gate = { access: Access; reasons: GateReason[] };
/** Each issue's gate by ticker, and the synthetic rating below which a
 * corporate issue needs the test. */
export type Gates = { testBelow: Rating; byTicker: Map<string, Gate> };

const isAccess = (x: string): x is Access => x === "open" || x === "test" || x === "qualified";
const isReason = (x: string): x is GateReason => (GATE_REASONS as readonly string[]).includes(x);
const isRating = (x: string): x is Rating => (RATINGS as readonly string[]).includes(x);

/** Reads accessJson. Throws on an access, a reason or a rating the
 * interface has no words for, so a change to the rule cannot show a
 * blank. */
export function parseGates(json: string): Gates {
  const raw = JSON.parse(json) as { testBelow: string; issues: { ticker: string; access: string; reasons: string[] }[] };
  if (!isRating(raw.testBelow)) throw new Error(`unknown rating ${raw.testBelow}`);
  const byTicker = new Map<string, Gate>();
  for (const i of raw.issues) {
    if (!isAccess(i.access)) throw new Error(`${i.ticker}: unknown access ${i.access}`);
    const unknown = i.reasons.find((r) => !isReason(r));
    if (unknown !== undefined) throw new Error(`${i.ticker}: unknown reason ${unknown}`);
    byTicker.set(i.ticker, { access: i.access, reasons: i.reasons.filter(isReason) });
  }
  return { testBelow: raw.testBelow, byTicker };
}
