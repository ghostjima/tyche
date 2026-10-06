// The Bank of Russia's figures the market is built on: the key rate,
// RUONIA, inflation and the zero-coupon yield curve of federal loan bonds,
// with their date, a link to cbr.ru, and the Moscow Exchange credited for
// the curve.
import { LineChart, Panel, StatBar } from "@ghostjima/stoa-react";
import { MACRO, SNAPSHOT, dayOf } from "../data/market";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";
import { BorSource } from "./Sources";

export function Benchmarks({ t, f }: { t: Strings; f: Formats }) {
  const l = SNAPSHOT.latest;
  const target = SNAPSHOT.inflation.values.at(-1)?.targetPct;
  return (
    <Panel title={t.benchmarks} className="benchmarks">
      <BorSource t={t} f={f} curve />
      <StatBar
        label={t.benchmarksLabel}
        items={[
          { label: t.bmKeyRate, value: f.percent(MACRO.keyRatePct / 100) },
          { label: t.bmRuonia(f.date(dayOf(l.ruoniaDate))), value: f.percent(MACRO.ruoniaPct / 100) },
          { label: t.bmInflation(f.month(l.inflationMonth)), value: f.percent(MACRO.inflationPct / 100) },
          ...(target === undefined ? [] : [{ label: t.bmTarget, value: f.percent(target / 100) }]),
        ]}
      />
      <LineChart
        label={t.curveTitle}
        description={t.curveDesc(f.date(0))}
        xType="number"
        xLabel={t.axisTerm}
        yLabel={t.axisCurveYield}
        formatX={(x) => f.decimal(x, x < 1 ? 2 : 0)}
        formatY={(y) => f.percent(y / 100, 1)}
        series={[{ id: "curve", name: t.seriesCurve, points: MACRO.curve.termsYears.map((x, i) => ({ x, y: MACRO.curve.yieldsPct[i] ?? 0 })), tone: "accent" }]}
      />
    </Panel>
  );
}
