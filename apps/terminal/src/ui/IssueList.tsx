// The list of issues: search, filter chips in groups with counts, a sort,
// and the issues as a record list: one tab stop, the arrow keys move
// through it, and picking an issue opens it.
import type { RefObject } from "react";
import { FilterBar, Ltr, RecordList, Select, type RecordListItem } from "@ghostjima/stoa-react";
import type { Bond } from "../data/issues";
import type { Strings } from "../i18n";
import { EMPTY_QUERY, GROUPS, chipCounts, type ChipId, type GroupId, type Item, type Query, type SearchTexts, type SortKey } from "../lib/filters";
import type { Formats } from "../lib/format";

const CHIP_LABEL: Record<ChipId, keyof Strings> = {
  gov: "chipGov",
  corporate: "chipCorporate",
  fixed: "chipFixed",
  floater: "chipFloater",
  linker: "chipLinker",
  short: "chipShort",
  medium: "chipMedium",
  long: "chipLong",
  amortising: "chipAmortising",
  offer: "chipOffer",
};
const GROUP_LABEL: Record<GroupId, keyof Strings> = {
  sector: "groupSector",
  coupon: "groupCoupon",
  term: "groupTerm",
  features: "groupFeatures",
};

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
};

export function IssueList({ t, f, all, visible, query, onQuery, sort, onSort, selectedId, onOpen, nameOf, textsOf, searchRef }: IssueListProps) {
  const counts = chipCounts(all, query, textsOf);
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

  // Stoa's FilterBar: the search, the chip groups with their counts (in a
  // sheet on a phone), how many issues are shown, Clear all, and the empty
  // state in the list's place. The sort sits over the list.
  return (
    <div ref={searchRef} className="issue-list">
      <FilterBar<ChipId>
        label={t.filtersLabel}
        search={{ label: t.search, value: query.search, onChange: (search) => onQuery({ ...query, search }) }}
        groups={GROUPS.map((group) => ({
          id: group.id,
          label: t[GROUP_LABEL[group.id]] as string,
          chips: group.chips.map((id) => ({ id, label: t[CHIP_LABEL[id]] as string, count: counts[id] })),
        }))}
        value={[...query.chips]}
        onChange={(chips) => onQuery({ ...query, chips })}
        onClear={() => onQuery(EMPTY_QUERY)}
        results={{ shown: visible.length, total: all.length }}
        emptyTitle={t.noMatchesTitle}
        emptyDescription={t.noMatchesBody}
      >
        <div className="issue-list__results">
          <div className="issue-list__sort">
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
          <RecordList label={t.listCaption} items={records} value={selectedId} onChange={onOpen} />
        </div>
      </FilterBar>
    </div>
  );
}
