// The goals at the top of the list: "Instead of a deposit", "Monthly
// income" and "Money by a date". A goal sets the filters below, which stay
// visible and can be changed; it is shown as on while they are exactly
// what it set. Each says in one sentence what it sets. "Money by a date"
// adds the month, as a month and a year.
import { FilterChipGroup, Select } from "@ghostjima/stoa-react";
import { VALUATION_DATE } from "../data/market";
import type { Strings } from "../i18n";
import { activeGoal, applyQuery, EMPTY_QUERY, goalQuery, GOALS, type GoalId, type Item, type Query, type SearchTexts } from "../lib/filters";
import type { Formats } from "../lib/format";
import { LIQUID_MAX_SPREAD_BP, LIQUID_MIN_DEPTH } from "../lib/liquidity";

const GOAL_LABEL: Record<GoalId, "goalDeposit" | "goalIncome" | "goalDate"> = { deposit: "goalDeposit", income: "goalIncome", date: "goalDate" };

export type GoalsProps = {
  t: Strings;
  f: Formats;
  all: readonly Item[];
  query: Query;
  onQuery: (q: Query) => void;
  textsOf: SearchTexts;
};

export function Goals({ t, f, all, query, onQuery, textsOf }: GoalsProps) {
  const goal = activeGoal(query);
  const note = (g: GoalId) =>
    g === "deposit" ? t.goalDepositNote(f.percent(LIQUID_MAX_SPREAD_BP / 10_000, 1), f.integer(LIQUID_MIN_DEPTH)) : g === "income" ? t.goalIncomeNote : t.goalDateNote;
  const [vy, vm] = VALUATION_DATE.split("-").map(Number) as [number, number];
  // Years up to the last maturity in the universe.
  const lastYear = vy + Math.ceil(Math.max(0, ...all.map((i) => i.derived.maturityDay)) / 365);
  const [by, bm] = (query.by ?? "").split("-").map(Number) as [number, number];
  const setBy = (year: number, month: number) =>
    onQuery({ ...query, by: `${year}-${String(year === vy ? Math.max(month, vm) : month).padStart(2, "0")}` });

  return (
    <div className="goals">
      <FilterChipGroup<GoalId>
        label={t.goalsLabel}
        chips={GOALS.map((g) => ({ id: g, label: t[GOAL_LABEL[g]], count: applyQuery(all, goalQuery(g, query, VALUATION_DATE), textsOf, VALUATION_DATE).length }))}
        value={goal === null ? [] : [goal]}
        onChange={(on) => {
          const next = on.find((g) => g !== goal);
          onQuery(next ? goalQuery(next, query, VALUATION_DATE) : { ...EMPTY_QUERY, search: query.search });
        }}
      />
      {goal !== null && (
        <p className="goals__note" data-goal={goal}>
          {note(goal)}
        </p>
      )}
      {query.by !== null && (
        <div className="goals__by" role="group" aria-labelledby="goals-by-label">
          <p id="goals-by-label" className="goals__by-label">
            {t.byLabel}
          </p>
          <div className="goals__by-fields">
            <Select<number>
              label={t.byMonth}
              size="small"
              value={bm}
              onChange={(m) => setBy(by, m)}
              options={Array.from({ length: 12 }, (_, i) => i + 1)
                .filter((m) => by > vy || m >= vm)
                .map((m) => ({ id: m, label: f.monthName(m) }))}
            />
            <Select<number>
              label={t.byYear}
              size="small"
              value={by}
              onChange={(y) => setBy(y, bm)}
              options={Array.from({ length: lastYear - vy + 1 }, (_, i) => vy + i).map((y) => ({ id: y, label: String(y) }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
