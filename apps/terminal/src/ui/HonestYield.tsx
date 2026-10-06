// The yield as a holder would get it: to maturity and to the offer side
// by side, before and after the broker's fee, and after tax and the fee
// with nothing reinvested, for the calculator's amount, account and other
// income; then how each figure is worked out, step by step, each step
// citing its rule. Every figure comes from the engine's explain.
import { DerivationTable, Disclosure, Table, type DerivationStep } from "@ghostjima/stoa-react";
import { TAX_HIGHER_RATE_PCT, TAX_RATE_PCT } from "@tyche/yield-twin";
import { TAX_RULES_DAY } from "../data/market";
import type { Explanation, Plan, Result, TaxYear, YieldTrace } from "../engine/types";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";

/** The day-count basis the engine's yields use. */
const BASIS = "ACT/365";

/** The articles of the Tax Code each tax step follows. */
const ARTICLE = { base: "214.1", relief: "219.1", rates: "224" } as const;

type Row = { id: "maturity" | "offer"; label: string; date: string; y: YieldTrace };
type Measure = { id: string; label: string; value: (y: YieldTrace) => string };

export type HonestYieldProps = {
  t: Strings;
  f: Formats;
  explanation: Result<Explanation>;
  plan: Plan;
};

/** The annual return after tax and the fee, or the return over the
 * period where the engine does not annualise it. */
function afterTax(t: Strings, f: Formats, y: YieldTrace): string {
  return y.held.annualPct === null ? t.overPeriod(f.percent(y.held.periodPct / 100)) : f.percent(y.held.annualPct / 100);
}

export function HonestYield({ t, f, explanation, plan }: HonestYieldProps) {
  if ("error" in explanation) {
    return (
      <section className="block" aria-labelledby="yield-h" data-testid="honest-yield">
        <h3 id="yield-h" className="block__title">
          {t.honestYield}
        </h3>
        <p className="muted">{t.workingError}</p>
      </section>
    );
  }
  const e = explanation.ok;
  const fee = f.percent(e.feePct / 100);
  const measures: Measure[] = [
    { id: "yield", label: t.colYield, value: (y) => f.percent(y.ytm) },
    { id: "fee", label: t.colAfterFee(fee), value: (y) => f.percent(y.ytmAfterFee) },
    { id: "tax", label: t.colAfterTax, value: (y) => afterTax(t, f, y) },
  ];
  const events: Row[] = [
    { id: "maturity", label: t.eventMaturityRow, date: f.day(e.toMaturity.eventDay), y: e.toMaturity },
    ...(e.toOffer ? [{ id: "offer", label: t.eventOfferRow, date: f.day(e.toOffer.eventDay), y: e.toOffer } satisfies Row] : []),
  ];
  return (
    <section className="block" aria-labelledby="yield-h" data-testid="honest-yield">
      <h3 id="yield-h" className="block__title">
        {t.honestYield}
      </h3>
      {/* The measures down the side and the events across, so the table
          fits a phone: three columns at most. */}
      <Table<Measure>
        wrapHeaders
        caption={t.yieldCaption}
        columns={[
          { id: "measure", header: t.colMeasure, cell: (m) => m.label },
          ...events.map((r) => ({
            id: r.id,
            header: (
              <span className="event-cell">
                {r.label}
                <span className="cell-note">{r.date}</span>
              </span>
            ),
            numeric: true,
            cell: (m: Measure) => m.value(r.y),
          })),
        ]}
        rows={measures}
        rowKey={(m) => m.id}
        rowHeader="measure"
        emptyText=""
      />
      <p className="muted" data-testid="yield-note">
        {plan.taxRegime === "iis_b"
          ? t.yieldNoteIis(f.money(e.toMaturity.held.invested))
          : t.yieldNote(f.money(e.toMaturity.held.invested), f.money(plan.otherIncome, { fractionDigits: 0 }))}
      </p>
      <Disclosure summary={t.working} className="working" data-testid="working">
        <div className="working__tables">
          <DerivationTable caption={t.workPrice} steps={priceSteps(t, f, e)} />
          {events.map((r) => (
            <DerivationTable key={r.id} caption={t.workYield(r.id === "offer" ? t.eventOffer : t.eventMaturity)} steps={yieldSteps(t, f, e, r.y)} />
          ))}
          {events.flatMap((r) =>
            r.y.tax.map((year) => (
              <DerivationTable
                key={`${r.id}-${year.year}`}
                caption={t.workTax(String(year.year), r.id === "offer" ? t.eventOffer : t.eventMaturity)}
                steps={taxSteps(t, f, year)}
              />
            )),
          )}
        </div>
      </Disclosure>
    </section>
  );
}

function priceSteps(t: Strings, f: Formats, e: Explanation): DerivationStep[] {
  const p = e.price;
  const terms = { name: t.srcTerms };
  return [
    {
      id: "coupon",
      label: t.stepCoupon,
      formula: `${f.money(p.nominal)} × ${f.percent(p.couponRatePct / 100)} × ${f.integer(p.periodDays)} / ${f.integer(365)}`,
      value: f.money(p.couponAmount),
      source: terms,
    },
    p.accruedQuoted === null
      ? {
          id: "accrued",
          label: t.stepAccrued,
          formula: `${f.money(p.couponAmount)} × ${f.integer(p.daysSinceLast)} / ${f.integer(p.periodDays)}`,
          value: f.money(p.accrued),
          source: terms,
        }
      : { id: "accrued", label: t.stepAccrued, value: f.money(p.accrued), source: terms },
    { id: "clean", label: t.stepClean, formula: `${f.money(p.nominal)} × ${f.percent(p.cleanPct / 100)}`, value: f.money(p.clean), source: terms },
    { id: "dirty", label: t.stepDirty, formula: `${f.money(p.clean)} + ${f.money(p.accrued)}`, value: f.money(p.dirty), source: terms },
  ];
}

function yieldSteps(t: Strings, f: Formats, e: Explanation, y: YieldTrace): DerivationStep[] {
  const engine = { name: t.srcEngine(BASIS) };
  const rate = f.percent(y.ytm, 4);
  const held = y.held;
  const lines = [held.coupons, held.amort, held.body, held.tax, held.commission].filter((v) => v !== 0);
  return [
    ...y.flows.map(
      (flow, i): DerivationStep => ({
        id: `flow-${i}`,
        label: t.stepFlow(f.day(flow.day)),
        formula: `${f.money(flow.amount)} × (1 + ${rate})^(−${f.decimal(flow.years, 4)})`,
        value: f.money(flow.presentValue),
        source: engine,
      }),
    ),
    { id: "sum", label: t.stepPresentValue, value: f.money(y.presentValue), source: engine },
    { id: "yield", label: t.stepYield, value: f.percent(y.ytm), source: engine },
    {
      id: "with-fee",
      label: t.stepPriceWithFee,
      formula: `${f.money(e.price.dirty)} × (1 + ${f.percent(e.feePct / 100)})`,
      value: f.money(y.priceWithFee),
      source: engine,
    },
    { id: "after-fee", label: t.stepYieldAfterFee, value: f.percent(y.ytmAfterFee), source: engine },
    {
      id: "held",
      label: t.stepHeldTotal,
      formula: sum(f, lines),
      value: f.money(held.total),
      source: engine,
    },
    held.annualPct === null
      ? { id: "after-tax", label: t.stepYieldAfterTax, formula: `${f.money(held.total)} / ${f.money(held.invested)} − 1`, value: f.percent(held.periodPct / 100), source: engine }
      : {
          id: "after-tax",
          label: t.stepYieldAfterTax,
          formula: `(${f.money(held.total)} / ${f.money(held.invested)})^(${f.integer(365)} / ${f.integer(held.horizonDay)}) − 1`,
          value: f.percent(held.annualPct / 100),
          source: engine,
        },
  ];
}

function taxSteps(t: Strings, f: Formats, y: TaxYear): DerivationStep[] {
  const revision = f.day(TAX_RULES_DAY);
  const code = (article: string) => ({ name: t.srcTaxCode(article), revision });
  const disposals = y.result + y.relieved;
  const steps: DerivationStep[] = [{ id: "coupons", label: t.stepCoupons, value: f.money(y.coupons), source: code(ARTICLE.base) }];
  if (y.accruedPaid !== 0) steps.push({ id: "accrued", label: t.stepAccruedPaid, value: f.money(-y.accruedPaid), source: code(ARTICLE.base) });
  if (y.redemptions !== 0) steps.push({ id: "redemptions", label: t.stepRedemptions, value: f.money(y.redemptions), source: code(ARTICLE.base) });
  if (y.redemptions !== 0 || y.sale !== 0) {
    steps.push(
      { id: "cost", label: t.stepCost, value: f.money(-y.cost), source: code(ARTICLE.base) },
      {
        id: "result",
        label: t.stepResult,
        formula: `${f.money(y.redemptions + y.sale)} − ${f.money(y.cost)}`,
        value: f.money(disposals, { signed: true }),
        source: code(ARTICLE.base),
      },
    );
  }
  if (y.exempt !== 0) steps.push({ id: "exempt", label: t.stepExempt, value: f.money(-y.exempt), source: code(ARTICLE.relief) });
  steps.push(
    { id: "base", label: t.stepBase, formula: sum(f, [y.coupons, -y.accruedPaid, y.reinvest, disposals, -y.exempt]), value: f.money(y.base), source: code(ARTICLE.base) },
    {
      id: "low",
      label: t.stepAtLow(f.percent(TAX_RATE_PCT / 100, 0)),
      formula: `${f.money(y.taxedLow)} × ${f.percent(TAX_RATE_PCT / 100, 0)}`,
      value: f.money((y.taxedLow * TAX_RATE_PCT) / 100),
      source: code(ARTICLE.rates),
    },
  );
  if (y.taxedHigh !== 0) {
    steps.push({
      id: "high",
      label: t.stepAtHigh(f.percent(TAX_HIGHER_RATE_PCT / 100, 0)),
      formula: `${f.money(y.taxedHigh)} × ${f.percent(TAX_HIGHER_RATE_PCT / 100, 0)}`,
      value: f.money((y.taxedHigh * TAX_HIGHER_RATE_PCT) / 100),
      source: code(ARTICLE.rates),
    });
  }
  steps.push({ id: "tax", label: t.stepTax, value: f.money(y.tax), source: code(ARTICLE.rates) });
  return steps;
}

/** Amounts written as a sum, the zero ones left out ("1 000,00 ₽ − 50,00
 * ₽ + 10,00 ₽"); none at all when a single amount is left. */
function sum(f: Formats, amounts: number[]): string | undefined {
  const terms = amounts.filter((v) => v !== 0);
  if (terms.length < 2) return undefined;
  return terms.map((v, i) => (i === 0 ? f.money(v) : `${v < 0 ? "−" : "+"} ${f.money(Math.abs(v))}`)).join(" ");
}
