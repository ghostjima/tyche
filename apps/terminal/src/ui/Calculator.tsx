// The calculator for the chosen issue: the inputs, then the plan as a
// signed breakdown, the sale before maturity under a key-rate change, the
// floater's key-rate scenarios and, for an issue with an offer, selling
// back against holding on. The engine computes everything; an error code
// it returns is shown as a sentence, with a way back to valid inputs.
import type { ReactNode } from "react";
import {
  Button,
  ButtonGroup,
  Callout,
  ChoiceGroup,
  LineChart,
  Metric,
  NumberField,
  Panel,
  Slider,
  Switch,
  Table,
  type TableColumn,
} from "@ghostjima/stoa-react";
import { IIS_B_LAST_OPEN_DAY, LDV_FIRST_DAY, TAX_RULES_DAY, dayToMs } from "../data/market";
import type { Breakdown, Calculation, Derived, ErrorCode, Plan, Result, TaxRegime } from "../engine/types";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";
import { COMMISSION_PCT, LDV_CAP_PER_YEAR, TAX_HIGHER_RATE_PCT, TAX_RATE_PCT, TAX_THRESHOLD, WORST_CASE_COUPON_PCT } from "@tyche/yield-twin";

/** What the calculator asks for: the engine's plan. */
export type PlanInput = Plan;

export const DEFAULT_AMOUNT = 100_000;

export function defaultPlan(d: Derived): PlanInput {
  return { amount: DEFAULT_AMOUNT, horizonDay: Math.max(1, Math.min(365, d.maturityDay)), reinvest: true, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 };
}

export type CalculatorProps = {
  t: Strings;
  f: Formats;
  derived: Derived;
  /** A floater: its coupons follow the key rate. */
  floater: boolean;
  plan: PlanInput;
  onPlan: (p: PlanInput) => void;
  result: Result<Calculation>;
  /** Where the figures come from, at the top of the calculator. */
  source: ReactNode;
};

type Line = { id: string; label: string; value: number; total?: boolean };

/** The annual return, or the return over the period where the engine
 * does not annualise it (a horizon under a month). */
export function annualText(t: Strings, f: Formats, b: Breakdown): string {
  return b.annualPct === null ? t.overPeriod(f.percent(b.periodPct / 100)) : f.percent(b.annualPct / 100);
}

export function Calculator({ t, f, derived: d, floater, plan, onPlan, result, source }: CalculatorProps) {
  const set = (patch: Partial<PlanInput>) => onPlan({ ...plan, ...patch });
  const pp = (v: number) => t.shiftValue(f.signed(v, 1));
  const horizonText = (day: number) =>
    day >= d.maturityDay ? t.horizonAtMaturity(f.term(day)) : d.offerDay === day ? t.horizonAtOffer(f.term(day)) : t.horizonHint(f.term(day));
  const taxDesc = [
    plan.taxRegime === "standard"
      ? [
          t.taxStandardDesc(f.percent(TAX_RATE_PCT / 100, 0), f.money(TAX_THRESHOLD, { fractionDigits: 0 }), f.percent(TAX_HIGHER_RATE_PCT / 100, 0)),
          plan.horizonDay >= LDV_FIRST_DAY ? t.taxLdvApplies(f.money(LDV_CAP_PER_YEAR, { fractionDigits: 0 })) : t.taxLdvLater(f.day(LDV_FIRST_DAY)),
        ].join(" ")
      : t.taxIisDesc(f.day(IIS_B_LAST_OPEN_DAY)),
    t.taxSource(f.day(TAX_RULES_DAY)),
  ].join(" ");

  return (
    <Panel title={t.calculator} className="calculator">
      {source}
      <div className="calc-inputs">
        <NumberField label={t.amount} value={plan.amount} onChange={(amount) => set({ amount })} minValue={0} />
        <div className="calc-horizon">
          <Slider
            label={t.horizon}
            value={plan.horizonDay}
            onChange={(horizonDay) => set({ horizonDay })}
            min={1}
            max={d.maturityDay}
            step={1}
            format={(day) => f.day(day)}
            hint={horizonText(plan.horizonDay)}
          />
          <ButtonGroup label={t.presets}>
            <Button onPress={() => set({ horizonDay: Math.min(365, d.maturityDay) })}>{t.presetYear}</Button>
            {d.offerDay !== null && <Button onPress={() => set({ horizonDay: d.offerDay! })}>{t.presetOffer}</Button>}
            <Button onPress={() => set({ horizonDay: d.maturityDay })}>{t.presetMaturity}</Button>
          </ButtonGroup>
        </div>
        <Switch isSelected={plan.reinvest} onChange={(reinvest) => set({ reinvest })} description={t.reinvestDesc(f.percent(d.ytmMaturity))}>
          {t.reinvest}
        </Switch>
        <ChoiceGroup<TaxRegime>
          label={t.tax}
          description={taxDesc}
          value={plan.taxRegime}
          onChange={(taxRegime) => set({ taxRegime })}
          choices={[
            { id: "standard", label: t.taxStandard },
            { id: "iis_b", label: t.taxIis },
          ]}
        />
        {plan.taxRegime === "standard" && (
          <div className="calc-field">
            <NumberField
              label={t.otherIncome}
              value={plan.otherIncome}
              onChange={(otherIncome) => set({ otherIncome })}
              minValue={0}
              keepTypedValue
              aria-describedby="other-income-desc"
            />
            <p id="other-income-desc" className="muted">
              {t.otherIncomeDesc(f.money(TAX_THRESHOLD, { fractionDigits: 0 }))}
            </p>
          </div>
        )}
        <Slider
          label={t.shift}
          value={plan.rateShiftPct}
          onChange={(rateShiftPct) => set({ rateShiftPct })}
          min={-3}
          max={3}
          step={0.5}
          format={pp}
          hint={floater ? t.shiftHintFloater : t.shiftHint}
        />
      </div>

      <section className="block" aria-labelledby="result-h" data-testid="result">
        <h3 id="result-h" className="block__title">
          {t.result}
        </h3>
        {"error" in result ? (
          <CalcError t={t} code={result.error} onReset={() => onPlan(defaultPlan(d))} />
        ) : (
          <Results t={t} f={f} d={d} floater={floater} plan={plan} c={result.ok} pp={pp} />
        )}
      </section>
    </Panel>
  );
}

function CalcError({ t, code, onReset }: { t: Strings; code: ErrorCode; onReset: () => void }) {
  return (
    <div data-testid="calc-error" data-code={code}>
      <Callout tone="negative" role="alert" title={t.errorTitle} action={<Button onPress={onReset}>{t.resetInputs}</Button>}>
        {t.errors[code]}
      </Callout>
    </div>
  );
}

function breakdownLines(t: Strings, f: Formats, b: Breakdown, toMaturity: boolean): Line[] {
  const lines: Line[] = [{ id: "coupons", label: t.rowCoupons, value: b.coupons }];
  if (b.reinvest !== 0) lines.push({ id: "reinvest", label: t.rowReinvest, value: b.reinvest });
  if (b.amort !== 0) lines.push({ id: "amort", label: t.rowAmort, value: b.amort });
  lines.push(
    { id: "body", label: toMaturity ? t.rowRedemption : t.rowSale, value: b.body },
    { id: "tax", label: t.rowTax, value: b.tax },
    { id: "commission", label: t.rowCommission(f.percent(COMMISSION_PCT / 100)), value: b.commission },
    { id: "total", label: t.rowTotal, value: b.total, total: true },
  );
  return lines;
}

function Results({
  t,
  f,
  d,
  floater,
  plan,
  c,
  pp,
}: {
  t: Strings;
  f: Formats;
  d: Derived;
  floater: boolean;
  plan: PlanInput;
  c: Calculation;
  pp: (v: number) => string;
}) {
  const b = c.plan;
  const lineColumns: TableColumn<Line>[] = [
    { id: "label", header: t.colItem, cell: (l) => (l.total ? <strong>{l.label}</strong> : l.label) },
    { id: "value", header: t.colAmount, numeric: true, cell: (l) => (l.total ? <strong>{f.money(l.value)}</strong> : f.money(l.value, { signed: true })) },
  ];
  const scenarioName = (shift: number) => (shift === 0 ? t.scenarioUnchanged : t.scenarioShift(f.signed(shift, 0)));

  return (
    <>
      <div className="metrics">
        <Metric label={t.total} value={f.money(b.total)} basis={t.totalBasis(f.day(b.horizonDay))} />
        <Metric label={t.profit} value={f.money(b.profit, { signed: true })} basis={t.profitBasis(f.money(b.invested))} />
        {b.annualPct === null ? (
          <Metric label={t.periodReturn} value={f.percent(b.periodPct / 100)} basis={t.periodReturnBasis} />
        ) : (
          <Metric label={t.annual} value={f.percent(b.annualPct / 100)} basis={t.annualBasis} />
        )}
        <Metric label={t.bonds} value={f.integer(b.qty)} basis={t.bondsBasis(f.money(d.dirtyPrice))} />
      </div>
      <Table<Line>
        wrapHeaders
        caption={t.breakdownCaption}
        columns={lineColumns}
        rows={breakdownLines(t, f, b, b.horizonDay >= d.maturityDay)}
        rowKey={(l) => l.id}
        rowHeader="label"
        emptyText=""
      />

      <section className="block" aria-labelledby="early-h" data-testid="early-exit">
        <h4 id="early-h" className="block__subtitle">
          {t.early}
        </h4>
        {c.earlyExit.applicable ? (
          <div className="metrics">
            <Metric label={t.earlyTotal(pp(plan.rateShiftPct))} value={f.money(c.earlyExit.result.total)} />
            <Metric label={t.earlyDiff} value={f.money(c.earlyExit.diff, { signed: true })} />
            {c.earlyExit.modDurationAtHorizon !== null && <Metric label={t.earlyDuration} value={f.decimal(c.earlyExit.modDurationAtHorizon, 2)} />}
          </div>
        ) : (
          <p className="muted">{t.earlyHeld}</p>
        )}
        {c.earlyExit.applicable && floater && plan.rateShiftPct !== 0 && <p className="muted">{t.earlyFloater}</p>}
      </section>

      {c.floater && (
        <section className="block" aria-labelledby="floater-h" data-testid="floater">
          <h4 id="floater-h" className="block__subtitle">
            {t.floater}
          </h4>
          <p className="muted">{t.floaterDesc}</p>
          <Table
            wrapHeaders
            caption={t.floaterCaption}
            columns={[
              { id: "scenario", header: t.colScenario, cell: (s: (typeof c.floater.scenarios)[number]) => scenarioName(s.shiftPct) },
              { id: "total", header: t.colTotal, numeric: true, cell: (s) => f.money(s.breakdown.total) },
              { id: "annual", header: t.colAnnual, numeric: true, cell: (s) => annualText(t, f, s.breakdown) },
            ]}
            rows={c.floater.scenarios}
            rowKey={(s) => s.shiftPct}
            rowHeader="scenario"
            emptyText=""
          />
          <LineChart
            label={t.couponsLabel}
            description={t.couponsDesc}
            xLabel={t.colDate}
            yLabel={t.axisCoupon}
            formatX={(x) => f.day(Math.round((x - dayToMs(0)) / 86_400_000))}
            formatY={(y) => f.money(y)}
            series={c.floater.scenarios.map((s) => ({
              id: String(s.shiftPct),
              name: scenarioName(s.shiftPct),
              tone: s.shiftPct < 0 ? "down" : s.shiftPct > 0 ? "up" : "neutral",
              points: c.floater!.days.map((day, i) => ({ x: dayToMs(day), y: s.coupons[i] ?? 0 })),
            }))}
          />
        </section>
      )}

      {c.offer && d.offerDay !== null && (
        <section className="block" aria-labelledby="offer-h" data-testid="offer">
          <h4 id="offer-h" className="block__subtitle">
            {t.offer}
          </h4>
          <p className="muted">{t.offerDesc(f.percent(WORST_CASE_COUPON_PCT / 100, 1))}</p>
          <Table
            wrapHeaders
            caption={t.offerCaption}
            columns={[
              { id: "way", header: t.colItem, cell: (r: { id: string; label: string; b: Breakdown }) => r.label },
              { id: "total", header: t.colTotal, numeric: true, cell: (r) => f.money(r.b.total) },
              { id: "annual", header: t.colAnnual, numeric: true, cell: (r) => annualText(t, f, r.b) },
            ]}
            rows={[
              { id: "before", label: t.rowSellBack(f.day(d.offerDay)), b: c.offer.before },
              { id: "after", label: t.rowHoldOn(f.day(d.maturityDay)), b: c.offer.after },
            ]}
            rowKey={(r) => r.id}
            rowHeader="way"
            emptyText=""
          />
        </section>
      )}
    </>
  );
}
