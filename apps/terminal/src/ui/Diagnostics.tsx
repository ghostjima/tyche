// The engine diagnostics, in a sheet: which engine computes the figures,
// how long the WebAssembly took to load, the last call on the active
// engine, and a timing of both engines on the issue and plan on screen.
import { useState } from "react";
import { Button, Callout, ChoiceGroup, Ltr, Sheet, StatBar, Table } from "@ghostjima/stoa-react";
import type { Engines } from "../engine/useEngines";
import { twinEngine } from "../engine/twin";
import type { EngineKind, Issue, Market, Plan } from "../engine/types";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";
import { BATCH, PERCENTILE, SAMPLES, timeEngine, type EngineTiming } from "../lib/timing";

export type DiagnosticsProps = {
  t: Strings;
  f: Formats;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  engines: Engines;
  choice: EngineKind;
  onChoice: (kind: EngineKind) => void;
  activeKind: EngineKind | null;
  lastDeriveMs: number | null;
  lastCalculateMs: number | null;
  /** What the timing runs on: the issue, plan and fee on screen. */
  subject: { issue: Issue; market: Market; plan: Plan; feePct: number } | null;
};

type Row = { id: string; engine: string; fn: string; median: number; p95: number };

export function Diagnostics({ t, f, isOpen, onOpenChange, engines, choice, onChoice, activeKind, lastDeriveMs, lastCalculateMs, subject }: DiagnosticsProps) {
  const [timings, setTimings] = useState<{ wasm: EngineTiming | null; twin: EngineTiming } | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = engines.status === "ready";
  const wasm = ready ? engines.wasm : null;
  const ms = (v: number | null, digits = 3) => (v === null ? "" : t.ms(f.decimal(v, digits)));

  const run = () => {
    if (!subject) return;
    setBusy(true);
    // Let the busy state paint before the timing blocks the thread.
    setTimeout(() => {
      const { issue, market, plan, feePct } = subject;
      setTimings({
        wasm: wasm ? timeEngine(wasm, issue, market, plan, feePct) : null,
        twin: timeEngine(twinEngine, issue, market, plan, feePct),
      });
      setBusy(false);
    }, 0);
  };

  const rows: Row[] = [];
  if (timings) {
    for (const [kind, timing] of [["wasm", timings.wasm], ["twin", timings.twin]] as const) {
      if (!timing) continue;
      const engine = kind === "wasm" ? t.engineWasm : t.engineTwin;
      rows.push({ id: `${kind}-d`, engine, fn: "derive_bond", median: timing.derive.median, p95: timing.derive.p95 });
      rows.push({ id: `${kind}-c`, engine, fn: "calculate", median: timing.calculate.median, p95: timing.calculate.p95 });
    }
  }

  return (
    <Sheet title={t.diagnostics} isOpen={isOpen} onOpenChange={onOpenChange}>
      <div className="diagnostics" data-active-engine={activeKind ?? ""}>
        <p className="muted">{t.engineNote}</p>
        {ready && !wasm ? (
          <Callout tone="warning" role="none">
            {t.wasmUnavailable}
          </Callout>
        ) : (
          <ChoiceGroup<EngineKind>
            label={t.engine}
            value={choice}
            onChange={onChoice}
            choices={[
              { id: "wasm", label: t.engineWasm },
              { id: "twin", label: t.engineTwin },
            ]}
          />
        )}
        <StatBar
          label={t.diagLabel}
          items={[
            { label: t.engine, value: activeKind === "wasm" ? t.engineWasm : activeKind === "twin" ? t.engineTwin : "" },
            { label: t.wasmLoad, value: ready && engines.wasmMs !== null ? ms(engines.wasmMs, 1) : t.notLoaded },
            { label: t.lastDerive, value: ms(lastDeriveMs) },
            { label: t.lastCalculate, value: ms(lastCalculateMs) },
          ]}
        />
        <Button onPress={run} isDisabled={busy || !subject}>
          {busy ? t.timing : t.timeBoth}
        </Button>
        <Table<Row>
          caption={t.timingCaption(f.integer(SAMPLES), f.integer(BATCH), f.integer(PERCENTILE))}
          columns={[
            // The engine and the function share the first column, one over
            // the other, so the table fits the sheet's width.
            {
              id: "engine",
              header: t.colCall,
              cell: (r) => (
                <span className="timing-call">
                  <span>{r.engine}</span>
                  <Ltr mono>{r.fn}</Ltr>
                </span>
              ),
            },
            { id: "median", header: t.colMedian, numeric: true, cell: (r) => ms(r.median) },
            { id: "p95", header: t.colP95(f.integer(PERCENTILE)), numeric: true, cell: (r) => ms(r.p95) },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          rowHeader="engine"
          emptyText={t.notTimed}
        />
      </div>
    </Sheet>
  );
}
