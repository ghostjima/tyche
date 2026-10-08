// Placements by book-building: new issues of the synthetic universe's
// fictional issuers, each a card with its book's window and a countdown in
// working days, the coupon guidance, the final coupon once the book has
// closed, and what an indicative request was allotted, with the rules of
// the synthetic universe that set them. Everything is a synthetic
// scenario from tyche-market.
import type { ReactNode } from "react";
import { Button, Countdown, DescriptionList, Ltr, Panel, Tag, useBreakpoint, type DescriptionItem, type TagTone } from "@ghostjima/stoa-react";
import { FULL_DEMAND, GUIDANCE_STEP_PCT, INDICATIVE_REQUEST, SETTLES_AFTER, type BookState, type Placement } from "../data/placements";
import { dayOf } from "../data/market";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";
import { allottedAmount, countdownDay } from "../lib/placements";
import { workingDaysUntil } from "../lib/workdays";

/** A countdown this many working days away, or closer, is drawn as close. */
const BOOK_WARN = 2;

const TONE: Record<BookState, TagTone> = { open: "positive", upcoming: "info", closed: "neutral" };

export type PlacementsProps = {
  t: Strings;
  f: Formats;
  placements: readonly Placement[];
  onClose: () => void;
  /** Where the figures come from, at the top of the panel. */
  source: ReactNode;
};

export function Placements({ t, f, placements, onClose, source }: PlacementsProps) {
  // On a phone each figure goes under its term.
  const layout = useBreakpoint() === "narrow" ? "stacked" : "columns";
  const frequency = (days: number) => (days <= 31 ? t.chipMonthly : days <= 92 ? t.chipQuarterly : t.chipSemiannual);
  return (
    <Panel title={t.placements} className="placements">
      {source}
      <p className="muted">{t.placementsNote}</p>
      <div>
        <Button id="placements-close" variant="ghost" onPress={onClose}>
          {t.placementsClose}
        </Button>
      </div>
      <ol className="placements__list">
        {placements.map((p) => {
          const name = t.companies[p.issuer.sector](t.places[p.issuer.place]);
          const due = countdownDay(p);
          const left = due === null ? null : workingDaysUntil(due);
          const amount = allottedAmount(p);
          const items: DescriptionItem[] = [
            {
              id: "book",
              term: t.plBook,
              description: (
                <span className="placement__stack">
                  <span>{t.plBookWindow(f.day(p.bookOpen), f.day(p.bookClose))}</span>
                  {left !== null && (
                    <Countdown left={left} unit="workingDays" warnAt={BOOK_WARN}>
                      {p.state === "open" ? t.plClosesIn(f.integer(left)) : t.plOpensIn(f.integer(left))}
                    </Countdown>
                  )}
                </span>
              ),
            },
            {
              id: "guidance",
              term: t.plGuidance,
              description: t.plGuidanceRange(f.percent(p.guidanceLowPct / 100), f.percent(p.guidanceHighPct / 100), frequency(p.periodDays)),
            },
            {
              id: "final",
              term: t.plFinal,
              description:
                p.finalCouponPct !== null && p.demand !== null ? (
                  <span className="placement__stack">
                    <strong>{f.percent(p.finalCouponPct / 100)}</strong>
                    <span className="cell-note">{t.plFinalWhy(f.decimal(p.demand, 2))}</span>
                  </span>
                ) : (
                  t.plFinalPending(f.day(p.bookClose))
                ),
            },
            {
              id: "allotment",
              term: t.plAllotment,
              description:
                amount !== null && p.allottedPct !== null && p.demand !== null
                  ? t.plAllotted(f.money(INDICATIVE_REQUEST, { fractionDigits: 0 }), f.money(amount, { fractionDigits: 0 }), f.percent(p.allottedPct / 100, 1))
                  : t.plAllotmentPending,
            },
            { id: "size", term: t.plSize, description: f.money(p.size, { fractionDigits: 0 }), numeric: true },
            { id: "term", term: t.plTerm, description: t.plTermValue(f.integer(p.termYears), f.day(dayOf(p.maturity))) },
            { id: "settlement", term: t.plSettlement, description: f.day(p.settlement) },
            { id: "rating", term: t.rating, description: t.riskRatingText(p.rating, t.outlook[p.outlook]) },
          ];
          return (
            <li key={p.ticker} className="placement" data-testid="placement" data-state={p.state}>
              <h3 className="placement__title">
                <Ltr mono>{p.ticker}</Ltr> <span>{name}</span>
              </h3>
              <Tag tone={TONE[p.state]}>{t.plState[p.state]}</Tag>
              <DescriptionList items={items} layout={layout} />
            </li>
          );
        })}
      </ol>
      <section className="block" aria-labelledby="placements-rules-h">
        <h3 id="placements-rules-h" className="block__title">
          {t.plRules}
        </h3>
        <ul className="placements__rules">
          <li>{t.plRuleGuidance(f.decimal(GUIDANCE_STEP_PCT, 2))}</li>
          <li>{t.plRuleFinal(f.decimal(FULL_DEMAND, 1))}</li>
          <li>{t.plRuleAllotment}</li>
          <li>{t.plRuleSettlement(f.integer(SETTLES_AFTER))}</li>
        </ul>
      </section>
    </Panel>
  );
}
