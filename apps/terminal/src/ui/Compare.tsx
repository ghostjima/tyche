// Up to three issues side by side: the yields, after tax and the fee too,
// duration, rating and outlook, coupon, offer, amortisation, liquidity,
// who can buy, and the G-spread to the Bank of Russia's zero-coupon
// curve of federal loan bonds. A column per issue, each with a button
// that takes it out; the measures down the side.
import type { ReactNode } from "react";
import { Button, Panel, Table, keepFocusInPlace } from "@ghostjima/stoa-react";
import { COMMISSION_PCT } from "@tyche/yield-twin";
import { CURVE, MARKET } from "../data/market";
import type { Engine, Plan } from "../engine/types";
import type { Strings } from "../i18n";
import type { Item } from "../lib/filters";
import type { Formats } from "../lib/format";
import { isLiquid } from "../lib/liquidity";
import { gSpreadText } from "./Analogues";

/** How many issues can be compared at once. */
export const COMPARE_MAX = 3;

type Measure = { id: string; label: string; value: (i: Item) => ReactNode };

export type CompareProps = {
  t: Strings;
  f: Formats;
  engine: Engine;
  items: readonly Item[];
  /** The plan each issue is worked out with: its own in the calculator,
   * else the default one. */
  planOf: (item: Item) => Plan;
  onRemove: (id: string) => void;
  nameOf: (item: Item) => string;
  source: ReactNode;
};

export function Compare({ t, f, engine, items, planOf, onRemove, nameOf, source }: CompareProps) {
  const frequency = (days: number) => (days <= 31 ? t.chipMonthly : days <= 92 ? t.chipQuarterly : t.chipSemiannual);
  const couponKind = (i: Item) =>
    i.bond.coupon.kind === "fixed" ? t.chipFixed : i.bond.coupon.kind === "key_rate" ? t.chipKeyRate : i.bond.coupon.kind === "ruonia" ? t.chipRuonia : t.chipLinker;
  // After tax and the fee to the nearest exit, nothing reinvested.
  const afterTax = (i: Item) => {
    const e = engine.explain(i.bond.issue, MARKET, planOf(i), COMMISSION_PCT, CURVE);
    if ("error" in e) return t.errors[e.error];
    const held = (e.ok.toOffer ?? e.ok.toMaturity).held;
    return held.annualPct === null ? t.overPeriod(f.percent(held.periodPct / 100)) : f.percent(held.annualPct / 100);
  };
  const measures: Measure[] = [
    { id: "ytm", label: t.ytm, value: (i) => f.percent(i.derived.ytmMaturity) },
    { id: "yto", label: t.ytmOffer, value: (i) => (i.derived.ytmOffer === null ? t.chipNoOffer : f.percent(i.derived.ytmOffer)) },
    { id: "after-tax", label: t.cmpAfterTax, value: afterTax },
    { id: "duration", label: t.cmpDuration, value: (i) => f.years(i.derived.macaulay) },
    { id: "rating", label: t.rating, value: (i) => t.cmpRatingValue(i.bond.rating, t.outlook[i.bond.outlook]) },
    {
      id: "coupon",
      label: t.colCoupon,
      value: (i) => t.cmpCouponValue(couponKind(i), f.percent((i.derived.ratesPct[0] ?? 0) / 100), frequency(i.bond.issue.periodDays)),
    },
    {
      id: "offer",
      label: t.riskOffer,
      value: (i) =>
        i.derived.offerDay === null ? t.chipNoOffer : i.bond.offer?.kind === "call" ? t.tagCall(f.day(i.derived.offerDay)) : t.tagPut(f.day(i.derived.offerDay)),
    },
    { id: "amortisation", label: t.riskAmortisation, value: (i) => (i.bond.issue.amortization.length > 0 ? t.chipAmortising : t.chipNoAmortisation) },
    {
      id: "liquidity",
      label: t.riskLiquidity,
      value: (i) => t.cmpLiquidityValue(isLiquid(i.bond) ? t.chipLiquid : t.chipIlliquid, f.percent(i.bond.liquidity.spreadBp / 10_000)),
    },
    { id: "access", label: t.riskAccess, value: (i) => (i.bond.qualifiedOnly ? t.chipQualified : t.chipOpen) },
    { id: "g", label: t.cmpGSpread, value: (i) => gSpreadText(t, f, engine, i) },
  ];

  return (
    <Panel title={t.compare} className="compare">
      {source}
      <Table<Measure>
        wrapHeaders
        caption={t.compareCaption}
        columns={[
          { id: "measure", header: t.colMeasureCompare, cell: (m) => m.label },
          ...items.map((i) => ({
            id: i.bond.id,
            header: (
              <span className="compare__head">
                <span>{i.bond.id}</span>
                <span className="cell-note">{nameOf(i)}</span>
                <Button
                  variant="ghost"
                  size="small"
                  onPress={(e) => {
                    // The column leaves with its button; the focus moves to
                    // the next stop where it was.
                    keepFocusInPlace(e.target);
                    onRemove(i.bond.id);
                  }}
                >
                  {t.removeIssue(i.bond.id)}
                </Button>
              </span>
            ),
            cell: (m: Measure) => m.value(i),
          })),
        ]}
        rows={measures}
        rowKey={(m) => m.id}
        rowHeader="measure"
        emptyText=""
      />
      <p className="muted">{t.compareNote}</p>
    </Panel>
  );
}
