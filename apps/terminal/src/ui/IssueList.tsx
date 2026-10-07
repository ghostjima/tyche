// The list of issues: search, filter chips in groups with counts, a sort,
// and the issues as a record list: one tab stop, the arrow keys move
// through it, and picking an issue opens it.
import type { RefObject } from "react";
import { Button, FilterBar, Ltr, RecordList, Select, type RecordListHandle, type RecordListItem } from "@ghostjima/stoa-react";
import type { Bond } from "../data/issues";
import type { Strings } from "../i18n";
import { VALUATION_DATE } from "../data/market";
import { EMPTY_QUERY, GROUPS, YIELD_BOUNDS, applyQuery, chipCounts, defaultMonth, monthEndDay, type ChipId, type GroupId, type Item, type Query, type SearchTexts, type SortKey } from "../lib/filters";
import type { Formats } from "../lib/format";
import { Goals } from "./Goals";

type YieldChip = "yieldLow" | "yieldMid" | "yieldHigh" | "yieldTop";

const CHIP_LABEL: Record<Exclude<ChipId, YieldChip>, keyof Strings> = {
  gov: "chipGov",
  corporate: "chipCorporate",
  durShort: "chipShort",
  durMedium: "chipMedium",
  durLong: "chipLong",
  ratingHigh: "chipRatingHigh",
  ratingA: "chipRatingA",
  ratingBbb: "chipRatingBbb",
  ratingLow: "chipRatingLow",
  fixed: "chipFixed",
  keyRate: "chipKeyRate",
  ruonia: "chipRuonia",
  linker: "chipLinker",
  monthly: "chipMonthly",
  quarterly: "chipQuarterly",
  semiannual: "chipSemiannual",
  noOffer: "chipNoOffer",
  put: "chipPut",
  call: "chipCall",
  noAmortisation: "chipNoAmortisation",
  amortising: "chipAmortising",
  open: "chipOpen",
  qualified: "chipQualified",
  liquid: "chipLiquid",
  illiquid: "chipIlliquid",
  short: "chipShort",
  medium: "chipMedium",
  long: "chipLong",
};

/** A chip's words; the yield bands take their bounds. */
function chipLabel(id: ChipId, t: Strings, f: Formats): string {
  const [low, mid, high] = YIELD_BOUNDS.map((x) => f.percent(x, 0)) as [string, string, string];
  switch (id) {
    case "yieldLow":
      return t.chipYieldBelow(low);
    case "yieldMid":
      return t.chipYieldBetween(low, mid);
    case "yieldHigh":
      return t.chipYieldBetween(mid, high);
    case "yieldTop":
      return t.chipYieldFrom(high);
    default:
      return t[CHIP_LABEL[id]] as string;
  }
}

const GROUP_LABEL: Record<GroupId, keyof Strings> = {
  sector: "groupSector",
  yield: "groupYield",
  duration: "groupDuration",
  rating: "groupRating",
  coupon: "groupCoupon",
  frequency: "groupFrequency",
  offer: "groupOffer",
  amortisation: "groupAmortisation",
  access: "groupAccess",
  liquidity: "groupLiquidity",
  term: "groupTerm",
};

/** The date filter's own chip in the bar, so the bar counts it, shows
 * Clear all for it, and turns it off. */
const BY = "by" as const;
type BarChip = ChipId | typeof BY;

export type IssueListProps = {
  t: Strings;
  f: Formats;
  all: readonly Item[];
  visible: readonly Item[];
  query: Query;
  onQuery: (q: Query) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
  nameOf: (bond: Bond) => string;
  /** What the search looks in besides the ticker. */
  textsOf: SearchTexts;
  /** Around the filters, for the search shortcut to find the search box. */
  searchRef: RefObject<HTMLDivElement | null>;
  /** The record list's handle, for putting the focus back on an issue's
   * row (`focusRecord`). */
  listRef?: RefObject<RecordListHandle | null>;
  /** Opens the ladder builder on the issues the filters leave. */
  onLadder: () => void;
};

export function IssueList({ t, f, all, visible, query, onQuery, sort, onSort, selectedId, onOpen, nameOf, textsOf, searchRef, listRef, onLadder }: IssueListProps) {
  const counts = chipCounts(all, query, textsOf, VALUATION_DATE);
  const by = query.by ?? defaultMonth(VALUATION_DATE);
  // The ticker names the record (typing it jumps there); the issuer, the
  // rating, the coupon and the maturity describe it; the yield is its value.
  const records: RecordListItem[] = visible.map(({ bond, derived }) => ({
    id: bond.id,
    label: bond.id,
    description: (
      <span className="issue-desc">
        <span>{nameOf(bond)}</span>
        <span className="issue-desc__facts">
          <span>
            {t.rating} <Ltr>{bond.rating}</Ltr>
          </span>
          <span>{bond.coupon.kind === "linker" ? t.chipLinker : bond.coupon.kind === "fixed" ? t.chipFixed : t.chipFloater}</span>
          <span>{t.matures(f.day(derived.maturityDay))}</span>
        </span>
      </span>
    ),
    meta: (
      <span className="cell-stack">
        <span>{f.percent(derived.yieldEvent)}</span>
        <span className="cell-note">{derived.event === "offer" ? t.toOffer : t.toMaturity}</span>
      </span>
    ),
  }));

  // The goals on top; then Stoa's FilterBar: the search, the chip groups
  // with their counts (in a sheet on a phone), the date when one is set,
  // how many issues are shown, Clear all, and the empty state in the
  // list's place. The sort sits over the list.
  return (
    <div ref={searchRef} className="issue-list">
      <Goals t={t} f={f} all={all} query={query} onQuery={onQuery} textsOf={textsOf} />
      <FilterBar<BarChip>
        label={t.filtersLabel}
        search={{ label: t.search, value: query.search, onChange: (search) => onQuery({ ...query, search }) }}
        groups={[
          ...GROUPS.map((group) => ({
            id: group.id,
            label: t[GROUP_LABEL[group.id]] as string,
            chips: group.chips.map((id) => ({ id: id as BarChip, label: chipLabel(id, t, f), count: counts[id] })),
          })),
          {
            id: "date",
            label: t.groupDate,
            chips: [{ id: BY, label: t.chipBy(f.day(monthEndDay(by, VALUATION_DATE))), count: applyQuery(all, { ...query, by }, textsOf, VALUATION_DATE).length }],
          },
        ]}
        value={[...query.chips, ...(query.by === null ? [] : [BY])]}
        onChange={(on) => onQuery({ ...query, chips: on.filter((c): c is ChipId => c !== BY), by: on.includes(BY) ? by : null })}
        onClear={() => onQuery(EMPTY_QUERY)}
        results={{ shown: visible.length, total: all.length }}
        emptyTitle={t.noMatchesTitle}
        emptyDescription={t.noMatchesBody}
      >
        <div className="issue-list__results">
          <div className="issue-list__sort">
            <Button id="ladder-open" variant="ghost" size="small" onPress={onLadder}>
              {t.ladderOpen}
            </Button>
            <Select<SortKey>
              label={t.sortBy}
              size="small"
              value={sort}
              onChange={onSort}
              options={[
                { id: "yield", label: t.sortYield },
                { id: "maturity", label: t.sortMaturity },
                { id: "rating", label: t.sortRating },
              ]}
            />
          </div>
          <RecordList ref={listRef} label={t.listCaption} items={records} value={selectedId} onChange={onOpen} />
        </div>
      </FilterBar>
    </div>
  );
}
