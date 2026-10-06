// The list's filters, search and sort, free of React so the rules are
// unit-tested. Filters come in groups: within a group any chip may match
// (fixed or floater), except the features group, where every chip that is
// on must match (amortising and with an offer). Across groups all must
// match. A chip's count is the size of the list the chip would give: the
// other groups and the search as they are, its own group with it on.
import { ratingIndex, type Bond } from "../data/issues";
import type { Derived } from "../engine/types";

export type Item = { bond: Bond; derived: Derived };

export type ChipId = "ofz" | "corporate" | "fixed" | "floater" | "short" | "medium" | "long" | "amortising" | "offer";

export type GroupId = "sector" | "coupon" | "term" | "features";

export const GROUPS: readonly { id: GroupId; mode: "any" | "all"; chips: readonly ChipId[] }[] = [
  { id: "sector", mode: "any", chips: ["ofz", "corporate"] },
  { id: "coupon", mode: "any", chips: ["fixed", "floater"] },
  { id: "term", mode: "any", chips: ["short", "medium", "long"] },
  { id: "features", mode: "all", chips: ["amortising", "offer"] },
];

const YEAR = 365;

const MATCH: Record<ChipId, (item: Item) => boolean> = {
  ofz: ({ bond }) => bond.issuer.kind === "ofz",
  corporate: ({ bond }) => bond.issuer.kind === "corporate",
  fixed: ({ bond }) => bond.issue.couponType === "fixed",
  floater: ({ bond }) => bond.issue.couponType === "floater",
  short: ({ derived }) => derived.maturityDay <= YEAR,
  medium: ({ derived }) => derived.maturityDay > YEAR && derived.maturityDay <= 3 * YEAR,
  long: ({ derived }) => derived.maturityDay > 3 * YEAR,
  amortising: ({ bond }) => bond.issue.amortization.length > 0,
  offer: ({ derived }) => derived.offerDay !== null,
};

export type Query = {
  /** The chips that are on. */
  chips: readonly ChipId[];
  /** Words to look for in the ticker and in the issue's search texts (the
   * issuer's name in the interface's language): each word must be found,
   * and a ticker matches with or without its separators ("okad 01",
   * "okad01", "OKAD-01"). */
  search: string;
};

/** The texts a search looks in besides the ticker. */
export type SearchTexts = (bond: Bond) => string[];

export const EMPTY_QUERY: Query = { chips: [], search: "" };

/** Lower case without diacritics, and ё read as е, so a search is
 * forgiving about case and accents. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/ё/g, "е");
}

/** Without spaces and separators, so "okad01" finds "OKAD-01". */
const compact = (text: string) => text.replace(/[\s\-_.,·]+/g, "");

function matchesSearch(item: Item, words: readonly string[], textsOf: SearchTexts): boolean {
  if (words.length === 0) return true;
  const texts = [item.bond.id, ...textsOf(item.bond)].map(fold);
  const joined = texts.map(compact);
  const whole = compact(words.join(""));
  if (joined.some((t) => t.includes(whole))) return true;
  return words.every((w) => texts.some((t) => t.includes(w)) || joined.some((t) => t.includes(compact(w))));
}

function matchesGroups(item: Item, chips: readonly ChipId[]): boolean {
  return GROUPS.every((group) => {
    const on = group.chips.filter((c) => chips.includes(c));
    if (on.length === 0) return true;
    return group.mode === "any" ? on.some((c) => MATCH[c](item)) : on.every((c) => MATCH[c](item));
  });
}

export function applyQuery(items: readonly Item[], query: Query, textsOf: SearchTexts): Item[] {
  const words = fold(query.search).split(/\s+/).filter((w) => w !== "");
  return items.filter((item) => matchesGroups(item, query.chips) && matchesSearch(item, words, textsOf));
}

/** How many items each chip would leave in the list. */
export function chipCounts(items: readonly Item[], query: Query, textsOf: SearchTexts): Record<ChipId, number> {
  const counts = {} as Record<ChipId, number>;
  for (const group of GROUPS) {
    for (const chip of group.chips) {
      const others = query.chips.filter((c) => !group.chips.includes(c));
      const own = group.mode === "any" ? [chip] : [...new Set([...query.chips.filter((c) => group.chips.includes(c)), chip])];
      counts[chip] = applyQuery(items, { chips: [...others, ...own], search: query.search }, textsOf).length;
    }
  }
  return counts;
}

export type SortKey = "yield" | "maturity" | "rating";

export function sortItems(items: readonly Item[], key: SortKey): Item[] {
  const tie = (a: Item, b: Item) => (a.bond.id < b.bond.id ? -1 : a.bond.id > b.bond.id ? 1 : 0);
  const copy = [...items];
  switch (key) {
    case "yield":
      return copy.sort((a, b) => b.derived.yieldEvent - a.derived.yieldEvent || tie(a, b));
    case "maturity":
      return copy.sort((a, b) => a.derived.maturityDay - b.derived.maturityDay || tie(a, b));
    case "rating":
      return copy.sort((a, b) => ratingIndex(a.bond.rating) - ratingIndex(b.bond.rating) || b.derived.yieldEvent - a.derived.yieldEvent || tie(a, b));
  }
}
