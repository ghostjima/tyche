// The holdings of a synthetic portfolio and what happens to them: the
// issues held, with a way to take one out; the events of every holding by
// date, as a list or on a calendar, a put offer's window with its deadline
// and a request to redeem at the offer that is recorded in this browser
// only; and the coupon income by month over the next twelve months.
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertDialog,
  Button,
  ChoiceGroup,
  Countdown,
  EventCalendar,
  Ltr,
  Panel,
  Skeleton,
  SkeletonLines,
  StatBar,
  Table,
  Timeline,
  VisuallyHidden,
  focusWhenReady,
  keepFocusInPlace,
  type CalendarEvent,
  type TimelineEntry,
} from "@ghostjima/stoa-react";
import type { HoldingEvent } from "../data/events";
import { dayToMs, VALUATION_DATE } from "../data/market";
import { calendarEntries, nextEntryDate, readView, writeView, type CalendarEntry, type EventsView } from "../lib/calendar";
import type { Strings } from "../i18n";
import type { Holding } from "../lib/holdings";
import { monthlyIncome, type MonthIncome } from "../lib/income";
import type { Formats } from "../lib/format";
import type { Item } from "../lib/filters";
import { cancelRequest, findRequest, loadRequests, recordRequest, type RedemptionRequest } from "../lib/requests";
import { workingDaysUntil } from "../lib/workdays";
import type { EventsState } from "../market/useEvents";

/** The inbox's period: the scenario's past events from half a year back,
 * and a year ahead. */
export const INBOX_FROM = -180;
export const INBOX_TO = 365;
/** The synthetic universe's put offer window (tyche-market's events rule):
 * five working days, ending three working days before the offer date. */
const WINDOW_DAYS = 5;
const WINDOW_ENDS_BEFORE = 3;
/** A deadline this many working days away, or closer, is drawn as close. */
const DEADLINE_WARN = 3;

/** A holding with its issue, for the screen. */
export type HeldItem = { holding: Holding; item: Item };

export type HoldingsProps = {
  t: Strings;
  f: Formats;
  held: readonly HeldItem[];
  events: EventsState;
  nameOf: (item: Item) => string;
  onRemove: (id: string) => void;
  /** Where the figures come from, at the top of the panel. */
  source: ReactNode;
};

/** A put offer's request: record it after a confirmation, or cancel it
 * while the window is open. The focus moves to the control that replaces
 * the one pressed. */
function RedeemAction({ t, f, id, event, bonds, requests, onRequests }: { t: Strings; f: Formats; id: string; event: HoldingEvent; bonds: number; requests: RedemptionRequest[]; onRequests: (all: RedemptionRequest[]) => void }) {
  const [confirming, setConfirming] = useState(false);
  const deadline = event.windowTo ?? event.day;
  const left = workingDaysUntil(deadline);
  const request = findRequest(requests, id, event.date);
  const requestId = `redeem-${id}`;
  const cancelId = `redeem-cancel-${id}`;
  if (left < 0) return <p className="muted">{t.requestClosed}</p>;
  return (
    <div className="redeem">
      <p className="redeem__deadline">
        {t.evDeadline} {f.day(deadline)}{" "}
        <Countdown left={left} unit="workingDays" warnAt={DEADLINE_WARN} />
      </p>
      {request ? (
        <>
          <p className="redeem__recorded" role="status">
            {t.requestRecorded(f.integer(request.bonds), f.day(deadline))}
          </p>
          <Button
            id={cancelId}
            onPress={() => {
              focusWhenReady(requestId);
              onRequests(cancelRequest({ id, offerDate: event.date }));
            }}
          >
            {t.requestCancel}
          </Button>
        </>
      ) : (
        <Button id={requestId} variant="primary" onPress={() => setConfirming(true)}>
          {t.requestRedeem}
        </Button>
      )}
      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={t.requestConfirmTitle(id)}
        confirmLabel={t.requestConfirm}
        onConfirm={() => {
          focusWhenReady(cancelId);
          onRequests(recordRequest({ id, offerDate: event.date, bonds }));
        }}
      >
        <p>{t.requestConfirmBody(f.integer(bonds), f.day(event.day))}</p>
      </AlertDialog>
    </div>
  );
}

function eventText(t: Strings, f: Formats, e: HoldingEvent): ReactNode {
  const amount = f.money(e.amount);
  switch (e.kind) {
    case "coupon":
    case "amortisation":
    case "maturity":
      return (
        <>
          <p>{t.evAmount(amount, f.money(e.perBond))}</p>
          {e.projected && <p className="muted">{t.evProjected}</p>}
        </>
      );
    case "put_offer":
      return <p>{t.evPut(amount, f.day(e.windowFrom ?? e.day), f.day(e.windowTo ?? e.day))}</p>;
    case "call_offer":
      return <p>{t.evCall(f.day(e.noticeDay ?? e.day))}</p>;
    case "rating_change":
      return (
        <p>
          {renderRating(t, e)} <span className="muted">{t.evScenario}</span>
        </p>
      );
    case "technical_default":
      return (
        <p>
          {t.evTechnical(amount)} <span className="muted">{t.evScenario}</span>
        </p>
      );
    case "default_cured":
      return (
        <p>
          {t.evCured(amount)} <span className="muted">{t.evScenario}</span>
        </p>
      );
    case "default":
      return (
        <p>
          {t.evDefault} <span className="muted">{t.evScenario}</span>
        </p>
      );
  }
}

/** The rating change's sentence, each rating kept left to right. */
function renderRating(t: Strings, e: HoldingEvent): ReactNode {
  const marker = "\u0000";
  const [before, middle, after] = t.evRating(marker, marker).split(marker) as [string, string, string];
  return (
    <>
      {before}
      <Ltr>{e.ratingFrom}</Ltr>
      {middle}
      <Ltr>{e.ratingTo}</Ltr>
      {after}
    </>
  );
}

/** A calendar entry's line: the issue and what happens on the day. */
function calendarTitle(t: Strings, f: Formats, c: CalendarEntry): string {
  const e = c.event;
  const amount = f.money(e.amount);
  switch (c.role) {
    case "window_opens":
      return t.calWindowOpens(c.id, f.day(e.windowTo ?? e.day));
    case "deadline":
      return t.calDeadline(c.id, f.day(e.day));
    case "notice":
      return t.calCallNotice(c.id, f.day(e.day));
    case "offer":
      return e.kind === "put_offer" ? t.calPutOffer(c.id, amount) : t.calCallOffer(c.id);
    case "event":
      break;
  }
  switch (e.kind) {
    case "rating_change":
      return t.calRating(c.id, e.ratingFrom ?? "", e.ratingTo ?? "");
    case "technical_default":
      return t.calTechnical(c.id, amount);
    case "default_cured":
      return t.calCured(c.id, amount);
    case "default":
      return t.calDefault(c.id);
    default:
      return t.calPayment(c.id, amount, f.money(e.perBond));
  }
}

export function Holdings({ t, f, held, events, nameOf, onRemove, source }: HoldingsProps) {
  const [requests, setRequests] = useState<RedemptionRequest[]>(loadRequests);
  // The list or the calendar, in ?ev= so a link opens the same view.
  const [view, setView] = useState<EventsView>(() => readView(new URLSearchParams(location.search)));
  useEffect(() => {
    const url = new URL(location.href);
    writeView(url.searchParams, view);
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  }, [view]);

  const entries: TimelineEntry[] =
    events.status === "ready"
      ? held.flatMap(({ holding }, k) =>
          (events.events[k] ?? [])
            .filter((e) => e.day >= INBOX_FROM && e.day <= INBOX_TO)
            .map((e, n): TimelineEntry => {
              const open = e.kind === "put_offer" && workingDaysUntil(e.windowTo ?? e.day) >= 0;
              const requested = e.kind === "put_offer" && findRequest(requests, holding.id, e.date) !== undefined;
              return {
                id: `${holding.id}-${n}`,
                at: dayToMs(e.day),
                kind: t.evKind[e.kind],
                actor: holding.id,
                emphasis: (open && !requested) || e.kind === "technical_default" || e.kind === "default",
                text: (
                  <div className="event-text" data-event={e.kind}>
                    {eventText(t, f, e)}
                    {e.kind === "put_offer" && (
                      <RedeemAction t={t} f={f} id={holding.id} event={e} bonds={holding.bonds} requests={requests} onRequests={setRequests} />
                    )}
                    {e.kind === "put_offer" && <p className="muted">{t.offerRule(f.integer(WINDOW_DAYS), f.integer(WINDOW_ENDS_BEFORE))}</p>}
                  </div>
                ),
              };
            }),
        )
      : [];

  // The same events on a calendar: a put offer on the first day of its
  // window, on its deadline, where the request is made, and on its date.
  const days: CalendarEntry[] =
    events.status === "ready"
      ? calendarEntries(
          held.map(({ holding }) => holding.id),
          events.events,
          INBOX_FROM,
          INBOX_TO,
        )
      : [];
  const calendar: CalendarEvent[] = days.map((c) => {
    const e = c.event;
    const holding = held.find((h) => h.holding.id === c.id)?.holding;
    return {
      id: c.key,
      date: c.date,
      kind: c.kind,
      title: calendarTitle(t, f, c),
      detail:
        e.source === "scenario" ? (
          <p className="muted">{t.calSynthetic}</p>
        ) : c.role === "deadline" && holding ? (
          <div className="event-text">
            <RedeemAction t={t} f={f} id={c.id} event={e} bonds={holding.bonds} requests={requests} onRequests={setRequests} />
            <p className="muted">{t.offerRule(f.integer(WINDOW_DAYS), f.integer(WINDOW_ENDS_BEFORE))}</p>
          </div>
        ) : c.role === "event" && e.projected ? (
          <p className="muted">{t.evProjected}</p>
        ) : undefined,
    };
  });
  const today = VALUATION_DATE;
  const first = nextEntryDate(days, 0);
  const selected = first !== null && first.slice(0, 7) === today.slice(0, 7) ? first : null;

  const months: MonthIncome[] = events.status === "ready" ? monthlyIncome(VALUATION_DATE, events.events) : [];
  const total = months.reduce((s, m) => s + m.coupons, 0);
  const noCoupon = months.filter((m) => m.coupons === 0).length;

  return (
    <Panel title={t.holdings} className="holdings">
      {source}
      <p className="muted">{t.holdingsNote}</p>
      <Table<HeldItem>
        wrapHeaders
        caption={t.holdingsCaption}
        columns={[
          {
            id: "issue",
            header: t.colIssue,
            cell: ({ item }) => (
              <span className="event-cell">
                <Ltr>{item.bond.id}</Ltr>
                <span className="cell-note">{nameOf(item)}</span>
              </span>
            ),
          },
          { id: "bonds", header: t.colBonds, numeric: true, cell: ({ holding }) => f.integer(holding.bonds) },
          { id: "face", header: t.colFace, numeric: true, cell: ({ holding, item }) => f.money(holding.bonds * item.bond.issue.nominal, { fractionDigits: 0 }) },
          {
            id: "remove",
            header: "",
            cell: ({ holding }) => (
              <Button
                variant="ghost"
                size="small"
                onPress={(e) => {
                  // The row leaves; the focus moves on to the next stop.
                  keepFocusInPlace(e.target);
                  onRemove(holding.id);
                }}
              >
                {t.removeShort} <VisuallyHidden>{holding.id}</VisuallyHidden>
              </Button>
            ),
          },
        ]}
        rows={[...held]}
        rowKey={({ holding }) => holding.id}
        rowHeader="issue"
        emptyText=""
      />

      <section className="block" aria-labelledby="inbox-h" data-testid="inbox">
        <h3 id="inbox-h" className="block__title">
          {t.inbox}
        </h3>
        <p className="muted">{t.inboxNote(f.day(INBOX_FROM), f.day(INBOX_TO))}</p>
        {events.status === "loading" ? (
          <Skeleton label={t.inboxLoading}>
            <SkeletonLines count={4} />
          </Skeleton>
        ) : events.status === "failed" ? (
          <p role="alert">{t.inboxFailed}</p>
        ) : (
          <>
            <ChoiceGroup<EventsView>
              label={t.inboxView}
              choices={[
                { id: "list", label: t.inboxViewList },
                { id: "calendar", label: t.inboxViewCalendar },
              ]}
              value={view}
              onChange={setView}
            />
            {view === "list" ? (
              <Timeline label={t.inboxLabel} entries={entries} timeZone="UTC" dayLevel={4} emptyText={t.inboxEmpty} />
            ) : (
              <div data-testid="calendar">
                <EventCalendar
                  label={t.calendarLabel}
                  events={calendar}
                  today={today}
                  defaultMonth={today.slice(0, 7)}
                  defaultSelectedDate={selected}
                  headingLevel={4}
                />
              </div>
            )}
          </>
        )}
      </section>

      <section className="block" aria-labelledby="income-h" data-testid="income">
        <h3 id="income-h" className="block__title">
          {t.income}
        </h3>
        <p className="muted">{t.incomeNote}</p>
        {events.status === "ready" && (
          <>
            <StatBar
              label={t.incomeLabel}
              items={[
                { label: t.incomeTotal, value: f.money(total) },
                { label: t.incomeAverage, value: f.money(total / 12) },
                { label: t.incomeNoCoupon, value: f.integer(noCoupon) },
              ]}
            />
            <Table<MonthIncome>
              wrapHeaders
              caption={t.incomeCaption}
              columns={[
                { id: "month", header: t.colMonth, cell: (m) => f.month(`${m.year}-${String(m.month).padStart(2, "0")}`) },
                {
                  id: "coupons",
                  header: t.colCoupons,
                  numeric: true,
                  cell: (m) => (
                    <span className="cell-stack">
                      <span>{f.money(m.coupons)}</span>
                      {m.projected && <span className="cell-note">{t.incomeProjected}</span>}
                    </span>
                  ),
                },
                { id: "principal", header: t.colPrincipalBack, numeric: true, cell: (m) => (m.principal > 0 ? f.money(m.principal) : "") },
              ]}
              rows={months}
              rowKey={(m) => `${m.year}-${m.month}`}
              rowHeader="month"
              emptyText=""
            />
          </>
        )}
      </section>
    </Panel>
  );
}
