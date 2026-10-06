// The list of issues: search, filter chips in groups with counts, a sort,
// and the issues as a record list: one tab stop, the arrow keys move
// through it, and picking an issue opens it.
import type { RefObject } from "react";
import { Button, EmptyState, FilterChipGroup, Ltr, RecordList, Select, TextField, type RecordListItem } from "@ghostjima/stoa-react";
import type { Bond } from "../data/issues";
import type { Strings } from "../i18n";
import { GROUPS, chipCounts, type ChipId, type GroupId, type Item, type Query, type SearchTexts, type SortKey } from "../lib/filters";
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
          <span>{t.matures(f.date(derived.maturityDay))}</span>
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
  const active = query.chips.length > 0 || query.search !== "";

  return (
    <div className="issue-list">
      <div ref={searchRef} className="issue-list__search">
        <TextField label={t.search} value={query.search} onChange={(search) => onQuery({ ...query, search })} />
      </div>
      {GROUPS.map((group) => (
        <FilterChipGroup<ChipId>
          key={group.id}
          label={t[GROUP_LABEL[group.id]] as string}
          size="small"
          chips={group.chips.map((id) => ({ id, label: t[CHIP_LABEL[id]] as string, count: counts[id] }))}
          value={query.chips.filter((c) => group.chips.includes(c))}
          onChange={(on) => onQuery({ ...query, chips: [...query.chips.filter((c) => !group.chips.includes(c)), ...on] })}
        />
      ))}
      <div className="issue-list__bar">
        <p className="muted" role="status">
          {t.listCount(f.integer(visible.length), f.integer(all.length))}
        </p>
        {active && (
          <Button variant="ghost" onPress={() => onQuery({ chips: [], search: "" })}>
            {t.clearFilters}
          </Button>
        )}
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
      {visible.length === 0 ? (
        <EmptyState
          title={t.noMatchesTitle}
          description={t.noMatchesBody}
          action={<Button onPress={() => onQuery({ chips: [], search: "" })}>{t.clearFilters}</Button>}
        />
      ) : (
        <RecordList label={t.listCaption} items={records} value={selectedId} onChange={onOpen} />
      )}
    </div>
  );
}
