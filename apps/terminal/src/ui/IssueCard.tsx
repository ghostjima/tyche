// One issue: what it is, its risks, its yield after tax and fees with the
// working shown, its derived figures, its payment schedule as an event
// strip and a table, and for a fixed coupon how its price depends on the
// yield.
import type { ReactNode } from "react";
import { Button, EventStrip, LineChart, Ltr, Metric, Panel, StatBar, Table, Tag, useBreakpoint, type StripEvent, type TableColumn, type TagTone } from "@ghostjima/stoa-react";
import type { TestKind } from "../data/gates";
import { ratingIndex, type Access, type Bond } from "../data/issues";
import { dayToMs } from "../data/market";
import type { Derived, Engine, Explanation, Plan, Result } from "../engine/types";
import type { Strings } from "../i18n";
import type { Item } from "../lib/filters";
import type { Formats } from "../lib/format";
import { COMPARE_MAX } from "./Compare";
import { Analogues } from "./Analogues";
import { HoldControl } from "./HoldControl";
import { HonestYield } from "./HonestYield";
import { Risks } from "./Risks";

export type IssueCardProps = {
  t: Strings;
  f: Formats;
  bond: Bond;
  derived: Derived;
  engine: Engine;
  name: string;
  /** Where the figures come from, at the top of the card. */
  source: ReactNode;
  /** The engine's working for the calculator's plan and the fee. */
  explanation: Result<Explanation>;
  plan: Plan;
  /** The broker's fee in percent, set in the yield block. */
  feePct: number;
  onFee: (feePct: number) => void;
  /** Every issue, for the analogues and the map of peers. */
  items: readonly Item[];
  /** The issues in the comparison. */
  compared: readonly string[];
  onCompare: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
  /** The bonds of this issue in the holdings, or null; whether the
   * holdings take no new issue; and adding the issue or setting its
   * bonds. */
  held: number | null;
  holdingsFull: boolean;
  onHold: (id: string, bonds: number) => void;
  /** Who may buy the issue, from the market's gate, and the broker's test
   * it needs; undefined until the market is ready. */
  access?: Access;
  test?: TestKind | null;
};

type Row = { day: number; coupon: number; principal: number; last: boolean };

/** Yields the price curve is drawn over, percent. */
const CURVE_YIELDS = Array.from({ length: 13 }, (_, i) => 6 + i * 2.5);

function ratingTone(bond: Bond): TagTone {
  const i = ratingIndex(bond.rating);
  return i <= 3 ? "positive" : i <= 9 ? "neutral" : "warning";
}

/** The coupon's tag: fixed, a floater on its index with its spread, or a
 * linker with its indexed face value. */
function couponTag(bond: Bond, t: Strings, f: Formats): string {
  switch (bond.coupon.kind) {
    case "fixed":
      return t.tagFixed;
    case "key_rate":
      return t.tagFloater(f.percent(bond.coupon.indexSpreadPct / 100));
    case "ruonia":
      return t.tagRuonia(f.percent(bond.coupon.indexSpreadPct / 100));
    case "linker":
      return t.tagLinker(f.money(bond.issue.nominal));
  }
}

export function IssueCard({ t, f, bond, derived: d, engine, name, source, explanation, plan, feePct, onFee, items, compared, onCompare, onOpen, held, holdingsFull, onHold, access, test }: IssueCardProps) {
  const inComparison = compared.includes(bond.id);
  const { issue } = bond;
  const floater = issue.couponType === "floater";
  const narrow = useBreakpoint() === "narrow";
  const rows: Row[] = d.flows.days.map((day, i) => ({
    day,
    coupon: d.flows.coupons[i] ?? 0,
    principal: d.flows.principals[i] ?? 0,
    last: i === d.flows.days.length - 1,
  }));
  const events: StripEvent[] = [
    ...d.couponDays.map((day, i): StripEvent => ({ id: `c${i}`, at: dayToMs(day), kind: "coupon" })),
    ...d.amortDays.map((day, i): StripEvent => ({ id: `a${i}`, at: dayToMs(day), kind: "amortisation" })),
    ...(d.offerDay === null ? [] : [{ id: "offer", at: dayToMs(d.offerDay), kind: "offer" } satisfies StripEvent]),
    { id: "maturity", at: dayToMs(d.maturityDay), kind: "maturity" },
  ];
  const eventsOf = (r: Row) => {
    const out: { key: string; label: string; tone: TagTone }[] = [];
    if (r.coupon > 0) out.push({ key: "c", label: t.evCoupon, tone: "neutral" });
    if (d.offerDay !== null && r.day === d.offerDay) out.push({ key: "o", label: t.evOffer, tone: "warning" });
    if (r.last) out.push({ key: "m", label: t.evMaturity, tone: "accent" });
    else if (r.principal > 0) out.push({ key: "a", label: t.evAmortisation, tone: "info" });
    return out;
  };
  const tags = (r: Row) => (
    <span className="tags">
      {eventsOf(r).map((e) => (
        <Tag key={e.key} tone={e.tone} size="small">
          {e.label}
        </Tag>
      ))}
    </span>
  );
  // On a phone five columns do not fit: the events go under the date and
  // the total, the sum of the two amounts beside it, is left out.
  const columns: TableColumn<Row>[] = narrow
    ? [
        {
          id: "date",
          header: t.colDate,
          cell: (r) => (
            <span className="event-cell">
              {f.day(r.day)}
              {tags(r)}
            </span>
          ),
        },
        { id: "coupon", header: t.colCoupon, numeric: true, cell: (r) => f.money(r.coupon) },
        { id: "principal", header: t.colPrincipal, numeric: true, cell: (r) => (r.principal > 0 ? f.money(r.principal) : "") },
      ]
    : [
        { id: "date", header: t.colDate, cell: (r) => f.day(r.day) },
        { id: "coupon", header: t.colCoupon, numeric: true, cell: (r) => f.money(r.coupon) },
        { id: "principal", header: t.colPrincipal, numeric: true, cell: (r) => (r.principal > 0 ? f.money(r.principal) : "") },
        { id: "total", header: t.colTotal, numeric: true, cell: (r) => f.money(r.coupon + r.principal) },
        { id: "event", header: t.colEvent, cell: tags },
      ];

  const amounts = rows.map((r) => r.coupon + r.principal);
  const curve = floater
    ? []
    : CURVE_YIELDS.map((y) => ({ x: y, y: engine.price_from_yield(amounts, d.flows.days, y / 100) }));

  return (
    <Panel title={name} className="issue-card">
      {source}
      <p className="issue-card__id">
        <Ltr mono>{bond.id}</Ltr>
      </p>
      <div className="tags">
        {/* The rating reads left to right: "BBB-" keeps its sign after the letters. */}
        <Tag tone={ratingTone(bond)}>
          {t.rating} <Ltr>{bond.rating}</Ltr>
        </Tag>
        <Tag>{bond.issuer.kind === "government" ? t.tagGov : t.tagCorporate}</Tag>
        <Tag tone={bond.coupon.kind === "fixed" ? "neutral" : "info"}>{couponTag(bond, t, f)}</Tag>
        {issue.amortization.length > 0 && <Tag tone="info">{t.tagAmortising}</Tag>}
        {d.offerDay !== null && <Tag tone="warning">{bond.offer?.kind === "call" ? t.tagCall(f.day(d.offerDay)) : t.tagPut(f.day(d.offerDay))}</Tag>}
        {bond.subordinated && <Tag tone="warning">{t.tagSubordinated}</Tag>}
        {bond.qualifiedOnly && <Tag tone="warning">{t.tagQualified}</Tag>}
      </div>

      <div className="compare-action">
        {inComparison || compared.length < COMPARE_MAX ? (
          <Button onPress={() => onCompare(bond.id, !inComparison)}>{inComparison ? t.removeCompare : t.addCompare}</Button>
        ) : (
          <p className="muted">{t.compareFull}</p>
        )}
      </div>
      <HoldControl t={t} f={f} bond={bond} held={held} full={holdingsFull} onHold={onHold} />
      <Risks t={t} f={f} bond={bond} derived={d} access={access} test={test} />
      <HonestYield t={t} f={f} explanation={explanation} plan={plan} realYield={bond.coupon.kind === "linker"} feePct={feePct} onFee={onFee} />
      <Analogues t={t} f={f} engine={engine} item={{ bond, derived: d }} items={items} compared={compared} onOpen={onOpen} />

      <section className="block" aria-labelledby="figures-h">
        <h3 id="figures-h" className="block__title">
          {t.figures}
        </h3>
        <div className="metrics" data-testid="figures">
          <Metric label={t.cleanPrice} value={f.percent(issue.pricePct / 100)} basis={t.cleanPriceBasis(f.money((issue.pricePct / 100) * issue.nominal))} />
          <Metric label={t.accrued} value={f.money(d.accrued)} basis={t.accruedBasis(f.term(d.daysSinceLast))} />
          <Metric label={t.dirtyPrice} value={f.money(d.dirtyPrice)} basis={t.dirtyPriceBasis} />
          <Metric
            label={t.ytm}
            value={f.percent(d.ytmMaturity)}
            basis={bond.coupon.kind === "linker" ? t.ytmRealBasis(f.day(d.maturityDay)) : t.ytmBasis(f.day(d.maturityDay))}
          />
          {d.ytmOffer !== null && d.offerDay !== null && (
            <Metric label={t.ytmOffer} value={f.percent(d.ytmOffer)} basis={t.ytmOfferBasis(f.day(d.offerDay))} />
          )}
          <Metric label={t.duration} value={f.years(d.macaulay)} basis={t.durationBasis(f.decimal(d.modified, 2))} />
        </div>
        <StatBar
          label={t.detailsLabel}
          items={[
            { label: t.couponRate, value: f.percent((d.ratesPct[0] ?? 0) / 100) },
            { label: t.couponPayment, value: f.money(d.couponAmount) },
            { label: t.paidEvery, value: f.term(issue.periodDays) },
            { label: t.nextCoupon, value: f.day(d.couponDays[0] ?? d.maturityDay) },
            { label: t.maturityDate, value: f.day(d.maturityDay) },
            { label: t.simpleYield, value: f.percent(d.ytmSimple) },
            { label: t.faceValue, value: f.money(issue.nominal, { fractionDigits: 0 }) },
          ]}
        />
      </section>

      <section className="block" aria-labelledby="schedule-h">
        <h3 id="schedule-h" className="block__title">
          {t.schedule}
        </h3>
        <EventStrip label={t.stripLabel} events={events} from={dayToMs(0)} />
        <Table<Row>
          wrapHeaders
          caption={t.paymentsCaption}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.day}
          rowHeader="date"
          emptyText={t.noPayments}
          stickyHeader
          maxHeight={320}
        />
      </section>

      {!floater && (
        <section className="block" aria-labelledby="curve-h">
          <h3 id="curve-h" className="block__title">
            {t.priceYield}
          </h3>
          <LineChart
            label={t.priceYieldLabel}
            description={t.priceYieldDesc}
            xType="number"
            xLabel={t.axisYield}
            yLabel={t.axisPrice}
            formatX={(x) => f.percent(x / 100, 1)}
            formatY={(y) => f.money(y, { fractionDigits: 0 })}
            series={[
              { id: "price", name: t.seriesPrice, points: curve, tone: "accent" },
              { id: "today", name: t.seriesToday, points: [{ x: d.ytmMaturity * 100, y: d.dirtyPrice }], tone: "warning" },
            ]}
          />
        </section>
      )}
    </Panel>
  );
}
