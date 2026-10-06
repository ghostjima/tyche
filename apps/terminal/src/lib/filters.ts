// The list's filters, search, goals and sort, free of React so the rules
// are unit-tested. Filters come in groups: within a group any chip may
// match (fixed or on the key rate), across groups all must. "By a date"
// keeps the issues that mature by the end of a month, or that the holder
// can sell back at a put offer by then. A chip's count is the size of the
// list the chip would give: the other groups, the date and the search as
// they are, its own group with it on.
//
// A goal is a preset of these filters, applied as visible, changeable
// chips: it is on while the filters are exactly what it set.
import { ratingIndex, type Bond } from "../data/issues";
import type { Derived } from "../engine/types";
import { isLiquid } from "./liquidity";

export type Item = { bond: Bond; derived: Derived };

export type ChipId =
  | "gov"
  | "corporate"
  | "yieldLow"
  | "yieldMid"
  | "yieldHigh"
  | "yieldTop"
  | "durShort"
  | "durMedium"
  | "durLong"
  | "ratingHigh"
  | "ratingA"
  | "ratingBbb"
  | "ratingLow"
  | "fixed"
  | "keyRate"
  | "ruonia"
  | "linker"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "noOffer"
  | "put"
  | "call"
  | "noAmortisation"
  | "amortising"
  | "open"
  | "qualified"
  | "liquid"
  | "illiquid"
  | "short"
  | "medium"
  | "long";

export type GroupId = "sector" | "yield" | "duration" | "rating" | "coupon" | "frequency" | "offer" | "amortisation" | "access" | "liquidity" | "term";

/** In the order shown: the issuer, then the professional filters, then the
 * maturity. */
export const GROUPS: readonly { id: GroupId; chips: readonly ChipId[] }[] = [
  { id: "sector", chips: ["gov", "corporate"] },
  { id: "yield", chips: ["yieldLow", "yieldMid", "yieldHigh", "yieldTop"] },
  { id: "duration", chips: ["durShort", "durMedium", "durLong"] },
  { id: "rating", chips: ["ratingHigh", "ratingA", "ratingBbb", "ratingLow"] },
  { id: "coupon", chips: ["fixed", "keyRate", "ruonia", "linker"] },
  { id: "frequency", chips: ["monthly", "quarterly", "semiannual"] },
  { id: "offer", chips: ["noOffer", "put", "call"] },
  { id: "amortisation", chips: ["noAmortisation", "amortising"] },
  { id: "access", chips: ["open", "qualified"] },
  { id: "liquidity", chips: ["liquid", "illiquid"] },
  { id: "term", chips: ["short", "medium", "long"] },
];

export const CHIP_IDS: readonly ChipId[] = GROUPS.flatMap((g) => g.chips);

/** The yield bands' bounds, as fractions: below the first, between each
 * two, from the last. The yield is to the offer where there is one, else
 * to maturity, as the list shows it. */
export const YIELD_BOUNDS = [0.14, 0.18, 0.22] as const;

const YEAR = 365;

/** A coupon paid this often or more counts as monthly, quarterly. */
const MONTH_DAYS = 31;
const QUARTER_DAYS = 92;

const inRating = (bond: Bond, best: string, worst: string) => {
  const i = ratingIndex(bond.rating);
  return i >= ratingIndex(best as Bond["rating"]) && i <= ratingIndex(worst as Bond["rating"]);
};

const MATCH: Record<ChipId, (item: Item) => boolean> = {
  gov: ({ bond }) => bond.issuer.kind === "government",
  corporate: ({ bond }) => bond.issuer.kind === "corporate",
  yieldLow: ({ derived }) => derived.yieldEvent < YIELD_BOUNDS[0],
  yieldMid: ({ derived }) => derived.yieldEvent >= YIELD_BOUNDS[0] && derived.yieldEvent < YIELD_BOUNDS[1],
  yieldHigh: ({ derived }) => derived.yieldEvent >= YIELD_BOUNDS[1] && derived.yieldEvent < YIELD_BOUNDS[2],
  yieldTop: ({ derived }) => derived.yieldEvent >= YIELD_BOUNDS[2],
  // Macaulay duration, as the issue card shows it.
  durShort: ({ derived }) => derived.macaulay <= 1,
  durMedium: ({ derived }) => derived.macaulay > 1 && derived.macaulay <= 3,
  durLong: ({ derived }) => derived.macaulay > 3,
  ratingHigh: ({ bond }) => inRating(bond, "AAA", "AA-"),
  ratingA: ({ bond }) => inRating(bond, "A+", "A-"),
  ratingBbb: ({ bond }) => inRating(bond, "BBB+", "BBB-"),
  ratingLow: ({ bond }) => inRating(bond, "BB+", "B"),
  fixed: ({ bond }) => bond.coupon.kind === "fixed",
  keyRate: ({ bond }) => bond.coupon.kind === "key_rate",
  ruonia: ({ bond }) => bond.coupon.kind === "ruonia",
  linker: ({ bond }) => bond.coupon.kind === "linker",
  monthly: ({ bond }) => bond.issue.periodDays <= MONTH_DAYS,
  quarterly: ({ bond }) => bond.issue.periodDays > MONTH_DAYS && bond.issue.periodDays <= QUARTER_DAYS,
  semiannual: ({ bond }) => bond.issue.periodDays > QUARTER_DAYS,
  noOffer: ({ derived }) => derived.offerDay === null,
  put: ({ bond, derived }) => derived.offerDay !== null && bond.offer?.kind === "put",
  call: ({ bond, derived }) => derived.offerDay !== null && bond.offer?.kind === "call",
  noAmortisation: ({ bond }) => bond.issue.amortization.length === 0,
  amortising: ({ bond }) => bond.issue.amortization.length > 0,
  open: ({ bond }) => !bond.qualifiedOnly,
  qualified: ({ bond }) => bond.qualifiedOnly,
  liquid: ({ bond }) => isLiquid(bond),
  illiquid: ({ bond }) => !isLiquid(bond),
  short: ({ derived }) => derived.maturityDay <= YEAR,
  medium: ({ derived }) => derived.maturityDay > YEAR && derived.maturityDay <= 3 * YEAR,
  long: ({ derived }) => derived.maturityDay > 3 * YEAR,
};

export type Query = {
  /** The chips that are on. */
  chips: readonly ChipId[];
  /** Words to look for in the ticker and in the issue's search texts (the
   * issuer's name in the interface's language): each word must be found,
   * and a ticker matches with or without its separators ("kamf 01",
   * "kamf01", "KAMF-01"). */
  search: string;
  /** "YYYY-MM": only issues that mature by the end of that month, or have
   * a put offer by then; null for no date. */
  by: string | null;
};

/** The texts a search looks in besides the ticker. */
export type SearchTexts = (bond: Bond) => string[];

export const EMPTY_QUERY: Query = { chips: [], search: "", by: null };

/** Lower case without diacritics, and ё read as е, so a search is
 * forgiving about case and accents. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/ё/g, "е");
}

/** Without spaces and separators, so "kamf01" finds "KAMF-01". */
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
    return on.length === 0 || on.some((c) => MATCH[c](item));
  });
}

const MONTH = /^(\d{4})-(\d{2})$/;

/** Whether `by` is a month the app can filter by: "YYYY-MM" from the
 * valuation date's month on. */
export function isMonth(by: string, valuationDate: string): boolean {
  const m = MONTH.exec(by);
  return m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12 && by >= valuationDate.slice(0, 7);
}

/** The day offset, from the valuation date, of the last day of a month. */
export function monthEndDay(by: string, valuationDate: string): number {
  const [y, m] = by.split("-").map(Number) as [number, number];
  const [vy, vm, vd] = valuationDate.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m, 0) - Date.UTC(vy, vm - 1, vd)) / 86_400_000);
}

/** The month a year after the valuation date's: where "Money by a date"
 * starts. */
export function defaultMonth(valuationDate: string): string {
  const [y, m] = valuationDate.split("-").map(Number) as [number, number];
  return `${y + 1}-${String(m).padStart(2, "0")}`;
}

function matchesBy(item: Item, endDay: number | null): boolean {
  if (endDay === null) return true;
  const { bond, derived } = item;
  return derived.maturityDay <= endDay || (bond.offer?.kind === "put" && derived.offerDay !== null && derived.offerDay <= endDay);
}

export function applyQuery(items: readonly Item[], query: Query, textsOf: SearchTexts, valuationDate: string): Item[] {
  const words = fold(query.search).split(/\s+/).filter((w) => w !== "");
  const endDay = query.by === null ? null : monthEndDay(query.by, valuationDate);
  return items.filter((item) => matchesGroups(item, query.chips) && matchesBy(item, endDay) && matchesSearch(item, words, textsOf));
}

/** How many items each chip would leave in the list. */
export function chipCounts(items: readonly Item[], query: Query, textsOf: SearchTexts, valuationDate: string): Record<ChipId, number> {
  const counts = {} as Record<ChipId, number>;
  for (const group of GROUPS) {
    const others = query.chips.filter((c) => !group.chips.includes(c));
    for (const chip of group.chips) counts[chip] = applyQuery(items, { ...query, chips: [...others, chip] }, textsOf, valuationDate).length;
  }
  return counts;
}

export type GoalId = "deposit" | "income" | "date";

export const GOALS: readonly GoalId[] = ["deposit", "income", "date"];

/** What each goal sets. "Instead of a deposit": the lowest risk the
 * universe has (synthetic government bonds and ratings from AA- up), a
 * duration up to a year, a fixed coupon or one on the key rate, open to
 * every investor, liquid. "Monthly income": coupons every month, with no
 * offer and no amortisation, so each issue's maturity is fixed and they
 * line up into a ladder. "Money by a date": the date alone. */
export const GOAL_CHIPS: Record<GoalId, readonly ChipId[]> = {
  deposit: ["ratingHigh", "durShort", "fixed", "keyRate", "open", "liquid"],
  income: ["monthly", "noOffer", "noAmortisation"],
  date: [],
};

/** The query a goal gives, keeping the search. */
export function goalQuery(goal: GoalId, query: Query, valuationDate: string): Query {
  return { search: query.search, chips: [...GOAL_CHIPS[goal]], by: goal === "date" ? (query.by ?? defaultMonth(valuationDate)) : null };
}

const sameChips = (a: readonly ChipId[], b: readonly ChipId[]) => a.length === b.length && a.every((c) => b.includes(c));

/** The goal that is on: "Money by a date" while a date is set; another
 * goal while the chips are exactly its own and no date is set. */
export function activeGoal(query: Query): GoalId | null {
  if (query.by !== null) return "date";
  return GOALS.find((g) => g !== "date" && sameChips(query.chips, GOAL_CHIPS[g])) ?? null;
}

export type SortKey = "yield" | "maturity" | "rating";

export const SORT_KEYS: readonly SortKey[] = ["yield", "maturity", "rating"];

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

/** The list's state in the URL: ?q= the search, ?f= once for each chip
 * that is on (a comma-separated list is read too), ?by= the month, ?sort=
 * the order (yield, the default, leaves it out). Anything the app does not
 * know is ignored. */
export function readListState(params: URLSearchParams, valuationDate: string): { query: Query; sort: SortKey } {
  const chips = params
    .getAll("f")
    .flatMap((f) => f.split(","))
    .filter((c): c is ChipId => (CHIP_IDS as readonly string[]).includes(c));
  const by = params.get("by");
  const sort = params.get("sort");
  return {
    query: { chips: [...new Set(chips)], search: params.get("q") ?? "", by: by !== null && isMonth(by, valuationDate) ? by : null },
    sort: (SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : "yield",
  };
}

/** Writes the list's state into `params`, leaving the other parameters. */
export function writeListState(params: URLSearchParams, query: Query, sort: SortKey): void {
  const set = (key: string, value: string) => (value === "" ? params.delete(key) : params.set(key, value));
  set("q", query.search);
  params.delete("f");
  for (const c of CHIP_IDS) if (query.chips.includes(c)) params.append("f", c);
  set("by", query.by ?? "");
  set("sort", sort === "yield" ? "" : sort);
}
