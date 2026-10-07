import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  AppHeader,
  Button,
  Callout,
  Disclosure,
  EmptyState,
  LanguageSwitch,
  PageShell,
  Panel,
  ScrollArea,
  ShortcutsDialog,
  Skeleton,
  SkeletonBlock,
  SkeletonLines,
  ThemeSwitch,
  groupShortcuts,
  focusWhenReady,
  keepFocusInPlace,
  useBreakpoint,
  useShortcuts,
  type RecordListHandle,
  type ThemePreference,
} from "@ghostjima/stoa-react";
import type { Bond } from "./data/issues";
import { CURVE, IIS_B_LAST_OPEN_DAY, KEY_RATE_PCT, MARKET, VALUATION_DATE } from "./data/market";
import { activeEngine, useEngineChoice, useEngines } from "./engine/useEngines";
import type { Plan } from "./engine/types";
import { LANGS, strings, type Lang } from "./i18n";
import { readFee, writeFee } from "./lib/fee";
import { HOLDINGS_MAX, readHoldings, setHolding, writeHoldings, type Holding } from "./lib/holdings";
import { LADDER_DEFAULT, readLadder, writeLadder, type LadderParams } from "./lib/ladder";
import { applyQuery, readListState, sortItems, writeListState, type Item, type Query, type SortKey } from "./lib/filters";
import { useAppFormats } from "./lib/format";
import { LIQUID_MAX_SPREAD_BP, LIQUID_MIN_DEPTH } from "./lib/liquidity";
import { issuerName, searchTexts } from "./lib/names";
import { timed } from "./lib/timing";
import { Calculator, defaultPlan, type PlanInput } from "./ui/Calculator";
import { useEvents } from "./market/useEvents";
import { useUniverse } from "./market/useUniverse";
import { Benchmarks } from "./ui/Benchmarks";
import { DataPage } from "./ui/DataPage";
import { Diagnostics } from "./ui/Diagnostics";
import { BorSource, SimSource, dataHref } from "./ui/Sources";
import { IssueCard } from "./ui/IssueCard";
import { IssueList } from "./ui/IssueList";
import { COMPARE_MAX, Compare } from "./ui/Compare";
import { Holdings, type HeldItem } from "./ui/Holdings";
import { Ladder } from "./ui/Ladder";

/** The issue asked for in ?issue=; whether the universe has it is known
 * once the universe is ready. */
const readIssue = (): string | null => new URLSearchParams(location.search).get("issue");

/** The history entry's mark for an issue opened over the list on a narrow
 * screen. */
const PUSHED = "tycheIssue";

/** Keeps the open issue in ?issue=, so a reload or a link opens it. With
 * `push`, as a new history entry, so the browser's Back returns to the
 * list. */
function writeIssue(id: string | null, push = false) {
  const url = new URL(location.href);
  if (id === null) url.searchParams.delete("issue");
  else url.searchParams.set("issue", id);
  if (push) history.pushState({ ...history.state, [PUSHED]: id }, "", url);
  else history.replaceState(history.state, "", url);
}

/** The issues in ?cmp=, once each, three at most; whether the universe
 * has them is known once it is ready. */
const readCompared = (): string[] => [...new Set(new URLSearchParams(location.search).getAll("cmp"))].slice(0, COMPARE_MAX);

const pushedIssue = (): unknown => (history.state as Record<string, unknown> | null)?.[PUSHED];

/** Whether ?page=data asks for the data and licensing page. */
const readPage = (): boolean => new URLSearchParams(location.search).get("page") === "data";
/** The history entry's mark for the data page opened from the app. */
const PUSHED_PAGE = "tychePage";
const pushedPage = (): unknown => (history.state as Record<string, unknown> | null)?.[PUSHED_PAGE];

/** A glossary entry's text, given the values its sentence takes. */
const termText = (text: string | ((...values: string[]) => string), values: string[]) => (typeof text === "function" ? text(...values) : text);

const TERM_KEYS = [
  "keyRate",
  "ruonia",
  "gov",
  "accrued",
  "ytm",
  "simpleYield",
  "offer",
  "call",
  "amortisation",
  "linker",
  "subordinated",
  "qualified",
  "duration",
  "ldv",
  "iis",
  "rating",
  "gSpread",
  "liquidity",
] as const;

/** The screen. Rendered inside an I18nProvider set to the language's
 * locale, which Stoa's words and digits follow. */
export function App({ lang, onLang, theme }: { lang: Lang; onLang: (lang: Lang) => void; theme: ThemePreference }) {
  const t = strings[lang];
  const f = useAppFormats();
  const { engines, retry } = useEngines();
  const { state: market, retry: retryMarket } = useUniverse();
  const bonds = market.status === "ready" ? market.universe.bonds : null;
  const [choice, setChoice] = useEngineChoice();
  const engine = activeEngine(engines, choice);
  // Side by side from Stoa's wide breakpoint, as the stylesheet lays it out.
  const wide = useBreakpoint() === "wide";

  // The goal, the filters, the search and the sort live in the URL, so a
  // reload or a link keeps them.
  const [initialList] = useState(() => readListState(new URLSearchParams(location.search), VALUATION_DATE));
  const [query, setQuery] = useState<Query>(initialList.query);
  const [sort, setSort] = useState<SortKey>(initialList.sort);
  useEffect(() => {
    const url = new URL(location.href);
    writeListState(url.searchParams, query, sort);
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  }, [query, sort]);
  // The broker's fee, one for the session, in the URL so a shared link
  // reproduces the figures: set in the card's yield block, used by the
  // card, the calculator and the comparison.
  const [feePct, setFeePct] = useState<number>(() => readFee(new URLSearchParams(location.search)));
  useEffect(() => {
    const url = new URL(location.href);
    writeFee(url.searchParams, feePct);
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  }, [feePct]);
  const [selectedId, setSelectedId] = useState<string | null>(readIssue);
  const [plans, setPlans] = useState<Record<string, PlanInput>>({});
  // The issues in the comparison, in ?cmp= once each, three at most.
  const [compared, setCompared] = useState<string[]>(readCompared);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.delete("cmp");
    for (const id of compared) url.searchParams.append("cmp", id);
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  }, [compared]);
  // The holdings of a synthetic portfolio, in ?hold= once per issue.
  const [holdings, setHoldings] = useState<Holding[]>(() => readHoldings(new URLSearchParams(location.search)));
  useEffect(() => {
    const url = new URL(location.href);
    writeHoldings(url.searchParams, holdings);
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  }, [holdings]);
  // The ladder builder, in ?lh=, ?la= and ?lr=, when it is open.
  const [ladder, setLadder] = useState<LadderParams | null>(() => readLadder(new URLSearchParams(location.search)));
  useEffect(() => {
    const url = new URL(location.href);
    writeLadder(url.searchParams, ladder);
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  }, [ladder]);
  const openLadder = () => {
    // The ladder's first field takes the focus once it is drawn.
    focusWhenReady(() => document.querySelector<HTMLElement>(".ladder input"));
    setLadder((l) => l ?? { years: LADDER_DEFAULT.years, amount: LADDER_DEFAULT.amount, picks: [] });
  };
  const closeLadder = () => {
    focusWhenReady("ladder-open");
    setLadder(null);
  };
  const hold = (id: string, bonds: number) => setHoldings((all) => setHolding(all, id, bonds));
  const unhold = (id: string) => setHoldings((all) => all.filter((h) => h.id !== id));
  const compare = (id: string, on: boolean) =>
    setCompared((all) => (on ? (all.includes(id) || all.length >= COMPARE_MAX ? all : [...all, id]) : all.filter((x) => x !== id)));
  const [diagOpen, setDiagOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [wasmNoticeDismissed, setWasmNoticeDismissed] = useState(false);
  const search = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const records = useRef<RecordListHandle>(null);
  const returnTo = useRef<string | null>(null);
  const [dataOpen, setDataOpen] = useState(readPage);
  const dataHeading = useRef<HTMLHeadingElement>(null);
  const dataLink = useRef<HTMLAnchorElement>(null);
  /** Where the link that opened the data page sits, to take the focus
   * back to the same link when the terminal is drawn again; `false` when
   * the focus goes elsewhere (the search shortcut). */
  const dataOpener = useRef<string | null | false>(null);

  useEffect(() => {
    document.title = t.title;
  }, [t]);

  const nameOf = (bond: Bond) => issuerName(bond, t);
  const textsOf = (bond: Bond) => searchTexts(bond, t);

  // Every issue of the universe derived by the active engine; derived
  // again when the engine changes.
  const items = useMemo<Item[] | null>(() => {
    if (!engine || !bonds) return null;
    return bonds.flatMap((bond) => {
      const r = engine.derive_bond(bond.issue, MARKET);
      return "ok" in r ? [{ bond, derived: r.ok }] : [];
    });
  }, [engine, bonds]);

  // A link may name issues the universe does not have: they leave the
  // comparison.
  useEffect(() => {
    if (items) setCompared((all) => (all.every((id) => items.some((i) => i.bond.id === id)) ? all : all.filter((id) => items.some((i) => i.bond.id === id))));
  }, [items]);

  // A link may name holdings the universe does not have: they leave it.
  useEffect(() => {
    if (items) setHoldings((all) => (all.every((h) => items.some((i) => i.bond.id === h.id)) ? all : all.filter((h) => items.some((i) => i.bond.id === h.id))));
  }, [items]);
  // Each holding with its issue and its place in the universe, for the
  // market worker's events.
  const held: (HeldItem & { index: number })[] = items && bonds ? holdings.flatMap((holding) => {
    const index = bonds.findIndex((b) => b.id === holding.id);
    const item = items.find((i) => i.bond.id === holding.id);
    return index >= 0 && item ? [{ holding, item, index }] : [];
  }) : [];
  const events = useEvents(held.map((h) => ({ index: h.index, bonds: h.holding.bonds })), market.status === "ready");

  // A link to an issue the universe does not have opens the list.
  useEffect(() => {
    if (items && selectedId !== null && !items.some((i) => i.bond.id === selectedId)) {
      setSelectedId(null);
      writeIssue(null);
    }
  }, [items, selectedId]);

  useEffect(() => {
    if (items && performance.getEntriesByName("tyche:list-ready").length === 0) performance.mark("tyche:list-ready");
  }, [items]);

  const visible = useMemo(() => (items ? sortItems(applyQuery(items, query, textsOf, VALUATION_DATE), sort) : []), [items, query, sort, t]);
  const selected = items?.find((i) => i.bond.id === selectedId) ?? null;
  const plan = selected ? (plans[selected.bond.id] ?? defaultPlan(selected.derived)) : null;
  const enginePlan: Plan | null = plan;

  // The figures on screen, with the time each call took on the active
  // engine, for the diagnostics.
  const lastDerive = useMemo(() => (engine && selected ? timed(() => engine.derive_bond(selected.bond.issue, MARKET))[1] : null), [engine, selected]);
  // The working behind the card's figures, for the calculator's plan and
  // the session's broker's fee, with the G-spreads to the snapshot's
  // zero-coupon curve.
  const explanation = useMemo(
    () => (engine && selected && enginePlan ? engine.explain(selected.bond.issue, MARKET, enginePlan, feePct, CURVE) : null),
    // The plan object is rebuilt on every render; its fields are what matter.
    [engine, selected, feePct, plan?.amount, plan?.horizonDay, plan?.reinvest, plan?.taxRegime, plan?.otherIncome, plan?.rateShiftPct],
  );
  const calc = useMemo(
    () => (engine && selected && enginePlan ? timed(() => engine.calculate(selected.bond.issue, MARKET, enginePlan, feePct)) : null),
    // The plan object is rebuilt on every render; its fields are what matter.
    [engine, selected, feePct, plan?.amount, plan?.horizonDay, plan?.reinvest, plan?.taxRegime, plan?.otherIncome, plan?.rateShiftPct],
  );

  // On a narrow screen the issue replaces the list like a page, so opening
  // it adds a history entry and the browser's Back (or Android's) returns
  // to the list; the page's own Back button goes back the same way.
  const open = (id: string) => {
    returnTo.current = id;
    setSelectedId(id);
    writeIssue(id, !wide && pushedIssue() === undefined);
  };
  const close = () => {
    if (pushedIssue() !== undefined) {
      history.back();
      return;
    }
    setSelectedId(null);
    writeIssue(null);
  };
  useEffect(() => {
    const follow = () => {
      setSelectedId(readIssue());
      setDataOpen(readPage());
    };
    addEventListener("popstate", follow);
    return () => removeEventListener("popstate", follow);
  }, []);

  // The data page replaces the terminal like a page: opening it adds a
  // history entry, so the browser's Back returns, and the page's own Back
  // goes back the same way.
  const openData = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // The widget's label link, by the widget, since the widget is drawn
    // anew when the terminal comes back.
    const widget = ["pane-list", "issue-card", "calculator"].find((c) => e.currentTarget.closest(`.${c}`));
    dataOpener.current = widget ? `.${widget} .stoa-source-note a` : null;
    history.pushState({ ...history.state, [PUSHED_PAGE]: "data" }, "", dataHref());
    setDataOpen(true);
  };
  const closeData = () => {
    if (pushedPage() !== undefined) {
      history.back();
      return;
    }
    const url = new URL(location.href);
    url.searchParams.delete("page");
    history.replaceState(history.state, "", url);
    setDataOpen(false);
  };
  // The focus goes to the page's heading when it opens from the app, and
  // back to the link that opened it (or the foot's link) when it closes. A
  // page loaded as it is keeps the browser's own start.
  const wasOpen = useRef(dataOpen);
  useEffect(() => {
    if (dataOpen === wasOpen.current) return;
    wasOpen.current = dataOpen;
    if (dataOpen) requestAnimationFrame(() => dataHeading.current?.focus());
    else {
      const opener = dataOpener.current;
      dataOpener.current = null;
      // The terminal draws its widgets a frame or two later: wait for them.
      const focusBack = (frames: number) => {
        const target = opener ? document.querySelector<HTMLElement>(opener) : dataLink.current;
        if (target) target.focus();
        else if (frames > 0) requestAnimationFrame(() => focusBack(frames - 1));
        else dataLink.current?.focus();
      };
      if (opener !== false) requestAnimationFrame(() => focusBack(10));
    }
  }, [dataOpen]);

  // On a narrow screen the issue replaces the list: focus goes to the
  // Back button when it opens, and back to the issue's row when it closes.
  useEffect(() => {
    if (wide) return;
    // Stoa's RecordList picks on the pointer's release, after the
    // browser's own focus for the press, so the Back button can take the
    // focus at once. The list is drawn anew with the closing commit, and
    // its `focusRecord` focuses the row as soon as the row's option exists.
    if (selectedId !== null) back.current?.querySelector("button")?.focus();
    else if (returnTo.current) records.current?.focusRecord(returnTo.current);
  }, [selectedId, wide]);

  // What the glossary's sentences take: the last day an account of type B
  // could be opened, and the liquidity thresholds.
  const termValues: Partial<Record<(typeof TERM_KEYS)[number], string[]>> = {
    iis: [f.day(IIS_B_LAST_OPEN_DAY)],
    liquidity: [f.percent(LIQUID_MAX_SPREAD_BP / 10_000, 1), f.integer(LIQUID_MIN_DEPTH)],
  };

  const help = useShortcuts([
    {
      key: "/",
      description: t.scSearch,
      group: t.scGeneral,
      onTrigger: () => {
        if (dataOpen) {
          dataOpener.current = false;
          closeData();
        }
        if (!wide && selectedId !== null) {
          // The focus goes to the search, not back to the issue's row.
          returnTo.current = null;
          close();
        }
        // After Back the list comes back with the history's next event, so
        // wait for the field for a few frames.
        const focusSearch = (frames: number) => {
          const input = search.current?.querySelector("input");
          if (input) input.focus();
          else if (frames > 0) requestAnimationFrame(() => focusSearch(frames - 1));
        };
        requestAnimationFrame(() => focusSearch(10));
      },
    },
    { key: "?", description: t.scHelp, group: t.scGeneral, onTrigger: () => setHelpOpen(true) },
  ]);

  const loading = engines.status === "loading" || market.status === "loading";
  const marketFailed = market.status === "failed";
  const wasmFailed = engines.status === "ready" && engines.wasm === null;

  const list = items && (
    <IssueList
      t={t}
      f={f}
      all={items}
      visible={visible}
      query={query}
      onQuery={setQuery}
      sort={sort}
      onSort={setSort}
      selectedId={selectedId}
      onOpen={open}
      nameOf={nameOf}
      textsOf={textsOf}
      searchRef={search}
      listRef={records}
      onLadder={openLadder}
    />
  );

  const detail =
    selected && engine && plan && calc && explanation ? (
      <div className="detail" data-issue-open={selected.bond.id}>
        <IssueCard
          key={selected.bond.id}
          t={t}
          f={f}
          bond={selected.bond}
          derived={selected.derived}
          engine={engine}
          name={nameOf(selected.bond)}
          source={
            // The Bank of Russia's curve gives the G-spreads; a floater's
            // coupon follows its key rate too.
            <>
              <SimSource t={t} onData={openData} />
              <BorSource t={t} f={f} curve />
            </>
          }
          explanation={explanation}
          plan={plan}
          feePct={feePct}
          onFee={setFeePct}
          items={items ?? []}
          compared={compared}
          onCompare={compare}
          onOpen={open}
          held={holdings.find((h) => h.id === selected.bond.id)?.bonds ?? null}
          holdingsFull={holdings.length >= HOLDINGS_MAX}
          onHold={hold}
        />
        <Calculator
          t={t}
          f={f}
          source={
            <>
              <SimSource t={t} onData={openData} />
              <BorSource t={t} f={f} />
            </>
          }
          derived={selected.derived}
          floater={selected.bond.issue.couponType === "floater"}
          plan={plan}
          onPlan={(p) => setPlans((all) => ({ ...all, [selected.bond.id]: p }))}
          result={calc[0]}
          feePct={feePct}
          onFee={setFeePct}
        />
      </div>
    ) : null;

  return (
    <PageShell
      header={
        <AppHeader
          title={t.title}
          subtitle={t.subtitle}
          note={<span className="demo-banner">{t.demoBanner}</span>}
          actions={
            <>
              <ThemeSwitch value={theme.choice} onChange={theme.setChoice} />
              <LanguageSwitch languages={LANGS} value={lang} onChange={(next) => onLang(next as Lang)} />
            </>
          }
        />
      }
      footer={
        <div className="foot">
          <p>
            {t.footer(f.day(0), f.percent(KEY_RATE_PCT / 100, 0))} {t.footerSource}{" "}
            <a href="https://www.cbr.ru/">cbr.ru</a>
          </p>
          <div className="foot__actions">
            <a ref={dataLink} className="foot__link" href={dataHref()} onClick={openData}>
              {t.dataPage}
            </a>
            <Button variant="ghost" onPress={() => setDiagOpen(true)}>
              {t.openDiagnostics}
            </Button>
            <Button variant="ghost" onPress={() => setHelpOpen(true)}>
              {t.openShortcuts}
            </Button>
          </div>
        </div>
      }
    >
      <div className="app" data-engine={engine?.kind ?? ""} data-state={loading ? "loading" : marketFailed ? "failed" : "ready"}>
        {wasmFailed && !wasmNoticeDismissed && (
          <Callout
            tone="warning"
            title={t.wasmFailedTitle}
            onDismiss={() => setWasmNoticeDismissed(true)}
            action={
              <Button
                onPress={(e) => {
                  // The notice leaves once the WebAssembly loads; the focus
                  // moves on to the next stop where it was instead of
                  // falling to the page.
                  keepFocusInPlace(e.target);
                  retry();
                }}
              >
                {t.wasmRetry}
              </Button>
            }
          >
            {t.wasmFailedBody}
          </Callout>
        )}
        {dataOpen ? (
          <DataPage
            ref={dataHeading}
            t={t}
            f={f}
            counts={bonds && market.status === "ready" ? { issues: bonds.length, issuers: new Set(bonds.map((b) => b.issuer.code)).size } : null}
            onBack={closeData}
          />
        ) : marketFailed ? (
          <Callout
            tone="negative"
            title={t.marketFailedTitle}
            action={
              <Button
                onPress={(e) => {
                  // The notice leaves with the retry; the focus moves on
                  // to the next stop instead of falling to the page.
                  keepFocusInPlace(e.target);
                  retryMarket();
                }}
              >
                {t.marketRetry}
              </Button>
            }
          >
            {t.marketFailedBody}
          </Callout>
        ) : loading ? (
          <div className="workspace" aria-busy="true">
            <Panel title={t.issues} className="pane-list">
              <SimSource t={t} onData={openData} />
              {/* As tall as the list will be, so what follows the
                  workspace does not move when the list arrives. */}
              <div className="pane-list__placeholder">
                <Skeleton label={t.loadingEngine}>
                  <SkeletonLines count={8} />
                </Skeleton>
              </div>
            </Panel>
            {wide && (
              <div className="detail" aria-hidden="true">
                <SkeletonBlock blockSize="calc(var(--stoa-space-12) * 6)" />
              </div>
            )}
          </div>
        ) : wide ? (
          <div className="workspace">
            <Panel title={t.issues} className="pane-list">
              <SimSource t={t} onData={openData} />
              <ScrollArea className="pane-list__scroll">{list}</ScrollArea>
            </Panel>
            {detail ?? (
              <div className="detail detail--empty">
                <EmptyState title={t.chooseTitle} description={t.chooseBody} />
              </div>
            )}
          </div>
        ) : detail ? (
          <div className="narrow">
            <div ref={back}>
              <Button variant="ghost" onPress={close}>
                {t.back}
              </Button>
            </div>
            {detail}
          </div>
        ) : (
          <Panel title={t.issues} className="pane-list">
            <SimSource t={t} onData={openData} />
            {list}
          </Panel>
        )}

        {!dataOpen && !loading && !marketFailed && items && engine && compared.length > 0 && (
          <Compare
            t={t}
            f={f}
            engine={engine}
            items={compared.flatMap((id) => items.filter((i) => i.bond.id === id))}
            planOf={(i) => plans[i.bond.id] ?? defaultPlan(i.derived)}
            feePct={feePct}
            onRemove={(id) => compare(id, false)}
            nameOf={(i) => nameOf(i.bond)}
            source={
              <>
                <SimSource t={t} onData={openData} />
                <BorSource t={t} f={f} curve />
              </>
            }
          />
        )}

        {!dataOpen && !loading && !marketFailed && held.length > 0 && (
          <Holdings
            t={t}
            f={f}
            held={held}
            events={events}
            nameOf={(i) => nameOf(i.bond)}
            onRemove={unhold}
            source={<SimSource t={t} onData={openData} />}
          />
        )}

        {!dataOpen && !loading && !marketFailed && ladder && items && engine && market.status === "ready" && (
          <Ladder
            t={t}
            f={f}
            engine={engine}
            items={visible}
            access={market.access}
            ladder={ladder}
            onLadder={setLadder}
            onClose={closeLadder}
            feePct={feePct}
            nameOf={(i) => nameOf(i.bond)}
            source={<SimSource t={t} onData={openData} />}
          />
        )}

        {!dataOpen && <Benchmarks t={t} f={f} />}

        {!dataOpen && (
          <Disclosure summary={t.glossary} className="glossary">
            <dl className="glossary__list">
              {TERM_KEYS.map((k) => {
                const [term, text] = t.terms[k];
                return (
                  <div key={k} className="glossary__item">
                    <dt>{term}</dt>
                    <dd>{termText(text, termValues[k] ?? [])}</dd>
                  </div>
                );
              })}
            </dl>
          </Disclosure>
        )}
      </div>

      <Diagnostics
        t={t}
        f={f}
        isOpen={diagOpen}
        onOpenChange={setDiagOpen}
        engines={engines}
        choice={choice}
        onChoice={setChoice}
        activeKind={engine?.kind ?? null}
        lastDeriveMs={lastDerive}
        lastCalculateMs={calc ? calc[1] : null}
        subject={selected && enginePlan ? { issue: selected.bond.issue, market: MARKET, plan: enginePlan, feePct } : null}
      />
      <ShortcutsDialog title={t.shortcutsTitle} isOpen={helpOpen} onOpenChange={setHelpOpen} groups={groupShortcuts(help, t.scGeneral)} />
    </PageShell>
  );
}
