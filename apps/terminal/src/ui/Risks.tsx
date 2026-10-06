// The risks of an issue, in the card where the decision is made: the
// offer with its date and the time left, the amortisation schedule,
// subordination, a floater's coupon resets, the synthetic rating with its
// outlook, who can buy it and what that means, and a liquidity warning
// from the synthetic order book, with the thresholds it checks.
import { Callout, Countdown, DescriptionList, Table, Tag, useBreakpoint, type DescriptionItem } from "@ghostjima/stoa-react";
import type { Bond } from "../data/issues";
import type { Derived } from "../engine/types";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";
import { LIQUID_MAX_SPREAD_BP, LIQUID_MIN_DEPTH, isLiquid } from "../lib/liquidity";
import { couponResets, type Reset } from "../lib/resets";

/** At this many days before the offer or fewer, the countdown warns. */
export const OFFER_WARN_DAYS = 30;

/** The law on qualified investors, as the risk text cites it. */
const QUALIFIED_LAW = { number: "39", article: "51.2" } as const;

type AmortRow = { day: number; fraction: number };

export function Risks({ t, f, bond, derived: d }: { t: Strings; f: Formats; bond: Bond; derived: Derived }) {
  const narrow = useBreakpoint() === "narrow";
  const { issue, liquidity } = bond;
  const spread = (bp: number) => f.percent(bp / 10_000, 2);
  const resets = couponResets(bond, d.couponDays[0] ?? d.maturityDay);
  // Every repayment of the face value, the final one included.
  const amort: AmortRow[] =
    d.amortDays.length === 0
      ? []
      : d.flows.days.flatMap((day, i) => ((d.flows.principals[i] ?? 0) > 0 ? [{ day, fraction: (d.flows.principals[i] ?? 0) / issue.nominal }] : []));

  const items: DescriptionItem[] = [
    {
      id: "offer",
      term: t.riskOffer,
      description:
        d.offerDay === null ? (
          t.riskOfferNone
        ) : (
          <div className="risk">
            <span>{bond.offer?.kind === "call" ? t.riskOfferCall(f.day(d.offerDay)) : t.riskOfferPut(f.day(d.offerDay))}</span>
            <Countdown left={d.offerDay} unit="days" warnAt={OFFER_WARN_DAYS} />
          </div>
        ),
    },
    {
      id: "amortisation",
      term: t.riskAmortisation,
      description:
        amort.length === 0 ? (
          t.riskAmortisationNone
        ) : (
          <div className="risk">
            <span>{t.riskAmortisationSome(f.integer(d.amortDays.length))}</span>
            <Table<AmortRow>
              wrapHeaders
              caption={t.amortCaption}
              columns={[
                { id: "date", header: t.colDate, cell: (r) => f.day(r.day) },
                { id: "share", header: t.colShare, numeric: true, cell: (r) => f.percent(r.fraction) },
                { id: "amount", header: t.colAmount, numeric: true, cell: (r) => f.money(issue.nominal * r.fraction) },
              ]}
              rows={amort}
              rowKey={(r) => r.day}
              rowHeader="date"
              emptyText=""
            />
          </div>
        ),
    },
    { id: "subordination", term: t.riskSubordination, description: bond.subordinated ? t.riskSubordinated : t.riskNotSubordinated },
    ...(resets.length > 0
      ? [
          {
            id: "resets",
            term: t.riskResets,
            description: (
              <div className="risk">
                <span>{bond.coupon.kind === "ruonia" ? t.resetsRuonia : t.resetsKeyRate}</span>
                <Table<Reset>
                  wrapHeaders
                  caption={t.resetsCaption}
                  columns={[
                    { id: "from", header: t.colPeriodFrom, cell: (r) => f.day(r.day) },
                    { id: "index", header: t.colIndex, numeric: true, cell: (r) => f.percent(r.indexPct / 100) },
                    { id: "spread", header: t.colSpread, numeric: true, cell: (r) => f.signedPercent(r.spreadPct / 100) },
                    { id: "rate", header: t.colRate, numeric: true, cell: (r) => f.percent(r.ratePct / 100) },
                  ]}
                  rows={resets}
                  rowKey={(r) => r.day}
                  rowHeader="from"
                  emptyText=""
                />
              </div>
            ),
          } satisfies DescriptionItem,
        ]
      : []),
    {
      id: "rating",
      term: t.rating,
      description: (
        <div className="risk risk--inline">
          <span>{t.riskRatingText(bond.rating, t.outlook[bond.outlook])}</span>
          {bond.outlook === "negative" && (
            <Tag tone="warning" size="small">
              {t.outlookNegativeTag}
            </Tag>
          )}
        </div>
      ),
    },
    {
      id: "access",
      term: t.riskAccess,
      description: bond.qualifiedOnly ? (
        <div className="risk">
          <span>
            <Tag tone="warning" size="small">
              {t.tagQualified}
            </Tag>
          </span>
          <span>{t.riskQualifiedOnly(t.lawSecurities(QUALIFIED_LAW.number, QUALIFIED_LAW.article))}</span>
        </div>
      ) : (
        t.riskOpenToAll
      ),
    },
    {
      id: "liquidity",
      term: t.riskLiquidity,
      description: isLiquid(bond) ? (
        t.liquidityOk(spread(liquidity.spreadBp), f.integer(liquidity.depth), spread(LIQUID_MAX_SPREAD_BP), f.integer(LIQUID_MIN_DEPTH))
      ) : (
        <div data-testid="liquidity-warning">
          <Callout tone="warning" title={t.liquidityLowTitle}>
            {t.liquidityLow(spread(liquidity.spreadBp), f.integer(liquidity.depth), spread(LIQUID_MAX_SPREAD_BP), f.integer(LIQUID_MIN_DEPTH))}
          </Callout>
        </div>
      ),
    },
  ];

  return (
    <section className="block" aria-labelledby="risks-h" data-testid="risks">
      <h3 id="risks-h" className="block__title">
        {t.risks}
      </h3>
      <DescriptionList items={items} layout={narrow ? "stacked" : "columns"} />
    </section>
  );
}
