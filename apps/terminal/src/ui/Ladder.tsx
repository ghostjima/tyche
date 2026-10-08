// The ladder builder: a horizon and an amount; one rung a year, each with
// an issue whose exit falls in that year, proposed from the list the
// filters leave and changeable; each rung held to its exit after the fee,
// the rungs' tax worked out together, the ladder's yield after tax and the
// fee, its payments by year, and every assumption the figures rest on. The
// engine works every figure out (lib/ladder.ts).
import { useMemo, type ReactNode } from "react";
import { Button, DerivationTable, DescriptionList, Disclosure, Ltr, NumberField, Panel, Select, StatBar, Table, useBreakpoint, type DerivationStep } from "@ghostjima/stoa-react";
import type { Access } from "../data/issues";
import { CURVE, MARKET, TAX_RULES_DAY, VALUATION_DATE } from "../data/market";
import type { Engine, PortfolioYear } from "../engine/types";
import type { Strings } from "../i18n";
import type { Item } from "../lib/filters";
import type { Formats } from "../lib/format";
import { LADDER_AMOUNT, LADDER_YEARS, candidates, chooseRungs, flowsByYear, rungSpan, workLadder, type LadderParams, type Rung, type YearFlow } from "../lib/ladder";
import { LDV_CAP_PER_YEAR, MIN_ANNUALISED_DAYS, TAX_HIGHER_RATE_PCT, TAX_RATE_PCT, TAX_THRESHOLD } from "@tyche/yield-twin";

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
                      { term: t.ladderBack, description: f.money(r.before) },
                      {
                        term: t.ladderYieldAfter,
                        // Not annualised under a month, as the engine's own yields.
                        description: r.exit < MIN_ANNUALISED_DAYS ? "" : f.percent(engine.ytm_effective([r.before], [r.exit], r.held.invested)),
                      },
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
              { label: t.ladderTax, value: f.money(result.tax) },
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
        {amountValid && result.taxYears.length > 0 && (
          <Disclosure summary={t.ladderTaxWorking} className="working" data-testid="ladder-tax">
            <div className="working__tables">
              {result.taxYears.map((y) => (
                <DerivationTable key={y.year} caption={t.ladderTaxYear(String(y.year))} steps={taxSteps(t, f, y)} />
              ))}
            </div>
          </Disclosure>
        )}
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
          <li>{t.ladderA8(t.srcTaxCodeAt("214.1", "16"), t.srcTaxCode("220.1"))}</li>
        </ul>
      </section>
    </Panel>
  );
}

/** The tax of one year of the ladder, the rungs together, step by step,
 * each step with the Tax Code's article and paragraph it follows. */
function taxSteps(t: Strings, f: Formats, y: PortfolioYear): DerivationStep[] {
  const revision = f.day(TAX_RULES_DAY);
  const code = (article: string, paragraph: string, sub?: string) => ({ name: t.srcTaxCodeAt(article, paragraph, sub), revision });
  const steps: DerivationStep[] = [{ id: "income", label: t.ladderStepIncome, value: f.money(y.income), source: code("214.1", "7") }];
  if (y.result !== 0) steps.push({ id: "result", label: t.ladderStepResult, value: f.money(y.result, { signed: true }), source: code("214.1", "12") });
  if (y.relieved !== 0) steps.push({ id: "relieved", label: t.ladderStepRelieved, value: f.money(y.relieved, { signed: true }), source: code("219.1", "1", "1") });
  if (y.exempt !== 0) {
    steps.push({
      id: "exempt",
      label: t.ladderStepExempt(f.money(LDV_CAP_PER_YEAR, { fractionDigits: 0 })),
      formula: `min(${f.money(y.relieved)}; ${f.money(LDV_CAP_PER_YEAR, { fractionDigits: 0 })} × ${f.decimal(y.relievedYears / y.relievedProceeds, 4)})`,
      value: f.money(-y.exempt),
      source: code("219.1", "2", "2"),
    });
  }
  steps.push(
    { id: "base", label: t.stepBase, formula: sum(f, [y.income, y.result, y.relieved, -y.exempt]), value: f.money(y.base), source: code("214.1", "14") },
    {
      id: "low",
      label: t.stepAtLow(f.percent(TAX_RATE_PCT / 100, 0)),
      formula: `${f.money(y.taxedLow)} × ${f.percent(TAX_RATE_PCT / 100, 0)}`,
      value: f.money((y.taxedLow * TAX_RATE_PCT) / 100),
      source: code("224", "1.1"),
    },
  );
  if (y.taxedHigh !== 0) {
    steps.push({
      id: "high",
      label: t.stepAtHigh(f.percent(TAX_HIGHER_RATE_PCT / 100, 0)),
      formula: `${f.money(y.taxedHigh)} × ${f.percent(TAX_HIGHER_RATE_PCT / 100, 0)}`,
      value: f.money((y.taxedHigh * TAX_HIGHER_RATE_PCT) / 100),
      source: code("224", "1.1"),
    });
  }
  steps.push({ id: "tax", label: t.stepTax, value: f.money(y.tax), source: code("224", "1.1") });
  return steps;
}

/** Amounts written as a sum, the zero ones left out; none at all when a
 * single amount is left. */
function sum(f: Formats, amounts: number[]): string | undefined {
  const terms = amounts.filter((v) => v !== 0);
  if (terms.length < 2) return undefined;
  return terms.map((v, i) => (i === 0 ? f.money(v) : `${v < 0 ? "−" : "+"} ${f.money(Math.abs(v))}`)).join(" ");
}
