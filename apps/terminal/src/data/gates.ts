// Who may buy each issue of the synthetic universe, with the reasons, as
// tyche-market writes them (accessJson): anyone, a non-qualified investor
// after a passed test, or qualified investors only. The rule is the
// market engine's; the order ticket shows its verdict and its reasons
// before a confirmation.
import { RATINGS, type Access, type Rating } from "./issues";

/** Every reason tyche-market's rule gives. */
export const GATE_REASONS = [
  "qualified_only",
  "subordinated_bank",
  "rating_below_threshold",
  "government",
  "rating_at_threshold",
  "index_government",
  "index_corporate",
  "index_below_level",
  "indexed_nominal",
] as const;
export type GateReason = (typeof GATE_REASONS)[number];

/** The reasons about a corporate floater's rating, which read against
 * `indexBelow` rather than `testBelow`. */
const INDEX_LEVEL_REASONS: readonly GateReason[] = ["index_corporate", "index_below_level"];

/** The broker's test an issue needs, by the kinds of deals of the
 * brokers' base standard: bonds rated below the Bank of Russia's level
 * (its point 6.1, subparagraph 6) or bonds with structured income
 * (subparagraph 8). */
export const TEST_KINDS = ["rating_below_level", "structured_income"] as const;
export type TestKind = (typeof TEST_KINDS)[number];

/** The brokers' base standard that sets the test, as the card cites it:
 * approved by the Bank of Russia on 30 April 2025, applied from
 * 7 November 2025. */
export const BASE_STANDARD = { approved: "2025-04-30", applied: "2025-11-07" } as const;

export type Gate = { access: Access; reasons: GateReason[]; test: TestKind | null };
/** Each issue's gate by ticker, the synthetic rating below which a
 * corporate issue needs the test, and the one below which a corporate
 * floater is for qualified investors only. */
export type Gates = { testBelow: Rating; indexBelow: Rating; byTicker: Map<string, Gate> };

/** The law on bonds whose payments follow an index, as the card and the
 * ticket cite it: Federal Law No. 192-FZ of 11 June 2021, article 11
 * (part 12 closes such bonds to non-qualified investors, part 13 opens
 * some of them after a test). */
export const INDEX_LAW = { number: "192", date: "2021-06-11", article: "11" } as const;

/** The reasons of an issue whose payments follow an index. */
export const isIndexReason = (reason: GateReason): boolean => reason.startsWith("index");

/** The synthetic rating a reason reads against. */
export const reasonLevel = (gates: Gates, reason: GateReason): Rating => (INDEX_LEVEL_REASONS.includes(reason) ? gates.indexBelow : gates.testBelow);

const isAccess = (x: string): x is Access => x === "open" || x === "test" || x === "qualified";
const isReason = (x: string): x is GateReason => (GATE_REASONS as readonly string[]).includes(x);
const isTestKind = (x: string): x is TestKind => (TEST_KINDS as readonly string[]).includes(x);
const isRating = (x: string): x is Rating => (RATINGS as readonly string[]).includes(x);

/** Reads accessJson. Throws on an access, a reason or a rating the
 * interface has no words for, so a change to the rule cannot show a
 * blank. */
export function parseGates(json: string): Gates {
  const raw = JSON.parse(json) as { testBelow: string; indexBelow: string; issues: { ticker: string; access: string; reasons: string[]; test: string | null }[] };
  if (!isRating(raw.testBelow)) throw new Error(`unknown rating ${raw.testBelow}`);
  if (!isRating(raw.indexBelow)) throw new Error(`unknown rating ${raw.indexBelow}`);
  const byTicker = new Map<string, Gate>();
  for (const i of raw.issues) {
    if (!isAccess(i.access)) throw new Error(`${i.ticker}: unknown access ${i.access}`);
    const unknown = i.reasons.find((r) => !isReason(r));
    if (unknown !== undefined) throw new Error(`${i.ticker}: unknown reason ${unknown}`);
    if (i.test !== null && !isTestKind(i.test)) throw new Error(`${i.ticker}: unknown test ${i.test}`);
    byTicker.set(i.ticker, { access: i.access, reasons: i.reasons.filter(isReason), test: i.test });
  }
  return { testBelow: raw.testBelow, indexBelow: raw.indexBelow, byTicker };
}
