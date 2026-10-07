// The ladder builder: a horizon and an amount; one rung a year, each with
// an issue whose exit falls in that year, proposed from the list the
// filters leave and changeable; each rung held to its exit after tax and
// the fee, the ladder's yield, its payments by year, and every
// assumption the figures rest on. The engine works every figure out
// (lib/ladder.ts).
import { useMemo, type ReactNode } from "react";
import { Button, DescriptionList, Ltr, NumberField, Panel, Select, StatBar, Table, useBreakpoint } from "@ghostjima/stoa-react";
import type { Access } from "../data/issues";
import { CURVE, MARKET, VALUATION_DATE } from "../data/market";
import type { Engine } from "../engine/types";
import type { Strings } from "../i18n";
import type { Item } from "../lib/filters";
import type { Formats } from "../lib/format";
import { LADDER_AMOUNT, LADDER_YEARS, candidates, chooseRungs, flowsByYear, rungSpan, workLadder, type LadderParams, type Rung, type YearFlow } from "../lib/ladder";
import { TAX_HIGHER_RATE_PCT, TAX_THRESHOLD } from "@tyche/yield-twin";

/** A rung's Select value for "no issue". */
const NONE = "-";

export type LadderProps = {
  t: Strings;
  f: Formats;
  engine: Engine;
  /** The issues the person's filters leave. */
  items: readonly Item[];
  access: Map<string, Access>;
  ladder: LadderParams;
  onLadder: (next: LadderParams) => void;
  onClose: () => void;
  feePct: number;
  nameOf: (item: Item) => string;
  /** Where the figures come from, at the top of the panel. */
  source: ReactNode;
};

export function Ladder({ t, f, engine, items, access, ladder, onLadder, onClose, feePct, nameOf, source }: LadderProps) {
  // On a phone each figure goes under its term.
  const narrow = useBreakpoint() === "narrow";
  const cands = useMemo(() => candidates(items, access, ladder.years), [items, access, ladder.years]);
  const chosen = chooseRungs(cands, ladder.picks);
  const result = useMemo(
    () => workLadder(engine, MARKET, CURVE, chosen, ladder.amount, feePct),
    // The chosen issues are rebuilt on every render; their tickers are what matter.
    [engine, chosen.map((c) => c?.bond.id ?? NONE).join(","), ladder.amount, feePct],
  );
  const done = result.rungs.filter((r): r is Rung => r !== null && "held" in r);
  const years: YearFlow[] = flowsByYear(VALUATION_DATE, done);
  const amountValid = Number.isInteger(ladder.amount) && ladder.amount >= LADDER_AMOUNT.min && ladder.amount <= LADDER_AMOUNT.max;

  const pick = (k: number, id: string) => {
    const picks = chosen.map((c) => c?.bond.id ?? null);
    picks[k] = id === NONE ? null : id;
    onLadder({ ...ladder, picks });
  };

  return (
    <Panel title={t.ladder} className="ladder">
      {source}
      <p className="muted">{t.ladderNote}</p>
      <div className="ladder__inputs">
        <NumberField
          label={t.ladderYears}
          value={ladder.years}
          minValue={LADDER_YEARS.min}
          maxValue={LADDER_YEARS.max}
          step={1}
          onChange={(years) => onLadder({ ...ladder, years, picks: ladder.picks.slice(0, years) })}
        />
        <NumberField
          label={t.ladderAmount}
          value={ladder.amount}
          minValue={LADDER_AMOUNT.min}
          maxValue={LADDER_AMOUNT.max}
          step={100_000}
          keepTypedValue
          onChange={(amount) => onLadder({ ...ladder, amount: Math.round(amount) })}
        />
        <Button variant="ghost" onPress={onClose}>
          {t.ladderClose}
        </Button>
      </div>

      <section className="block" aria-labelledby="ladder-rungs-h">
        <h3 id="ladder-rungs-h" className="block__title">
          {t.ladderRungs}
        </h3>
        <ol className="ladder__rungs">
          {cands.map((list, k) => {
            const span = rungSpan(k);
            const r = result.rungs[k];
            const item = chosen[k];
            return (
              <li key={k} className="ladder__rung" data-testid="rung">
                <h4 className="block__subtitle">{t.ladderRung(f.integer(k + 1), f.day(span.from), f.day(span.to))}</h4>
                {list.length === 0 ? (
                  <p className="muted">{t.ladderNoCandidate}</p>
                ) : (
                  <Select<string>
                    label={t.ladderPick}
                    value={item?.bond.id ?? NONE}
                    onChange={(id) => pick(k, id)}
                    options={[
                      ...list.map((i) => ({ id: i.bond.id, label: t.ladderOption(i.bond.id, f.percent(i.derived.yieldEvent), i.bond.rating) })),
                      { id: NONE, label: t.ladderNone },
                    ]}
                  />
                )}
                {item && r && "error" in r && <p role="alert">{r.error === "below_lot" ? t.ladderBelowLot : (t.errors as Record<string, string>)[r.error]}</p>}
                {item && r && "held" in r && (
                  <DescriptionList
                    layout={narrow ? "stacked" : "columns"}
                    items={[
                      { term: t.colIssue, description: <><Ltr>{item.bond.id}</Ltr>, {nameOf(item)}</> },
                      { term: t.ladderExit, description: r.offer ? t.ladderExitOffer(f.day(r.exit)) : t.ladderExitMaturity(f.day(r.exit)) },
                      { term: t.ladderYieldExit, description: f.percent(item.derived.yieldEvent) },
                      { term: t.ladderBonds, description: f.integer(r.bonds) },
                      { term: t.ladderPaid, description: f.money(r.held.invested) },
                      { term: t.ladderBack, description: f.money(r.held.total) },
                      { term: t.ladderYieldAfter, description: r.held.annualPct === null ? "" : f.percent(r.held.annualPct / 100) },
                    ]}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="block" aria-labelledby="ladder-sum-h" data-testid="ladder-summary">
        <h3 id="ladder-sum-h" className="block__title">
          {t.ladderSummary}
        </h3>
        {amountValid && done.length > 0 && (
          <StatBar
            label={t.ladderSummary}
            items={[
              { label: t.ladderInvested, value: f.money(result.invested) },
              { label: t.ladderReceived, value: f.money(result.received) },
              { label: t.ladderYield, value: f.percent(result.yieldAfter) },
              { label: t.ladderFilled, value: `${f.integer(done.length)} / ${f.integer(ladder.years)}` },
            ]}
          />
        )}
        <Table<YearFlow>
          wrapHeaders
          caption={t.ladderFlows}
          columns={[
            { id: "year", header: t.colYear, cell: (y) => <Ltr>{String(y.year)}</Ltr> },
            { id: "coupons", header: t.colCoupons, numeric: true, cell: (y) => f.money(y.coupons) },
            { id: "principal", header: t.colPrincipalBack, numeric: true, cell: (y) => (y.principal > 0 ? f.money(y.principal) : "") },
          ]}
          rows={years}
          rowKey={(y) => y.year}
          rowHeader="year"
          emptyText={t.ladderNoCandidate}
        />
      </section>

      <section className="block" aria-labelledby="ladder-as-h">
        <h3 id="ladder-as-h" className="block__title">
          {t.ladderAssumptions}
        </h3>
        <ul className="ladder__assumptions">
          <li>{t.ladderA1}</li>
          <li>{t.ladderA2}</li>
          <li>{t.ladderA3}</li>
          <li>{t.ladderA4(f.money(TAX_THRESHOLD, { fractionDigits: 0 }), f.percent(TAX_HIGHER_RATE_PCT / 100, 0), f.percent(feePct / 100, 2))}</li>
          <li>{t.ladderA5}</li>
          <li>{t.ladderA6}</li>
          <li>{t.ladderA7}</li>
        </ul>
      </section>
    </Panel>
  );
}
