// The holdings' events as the calendar lays them out: each on its day,
// with the calendar's kind. A put offer takes three days, the first day
// of its window, the deadline (the window's last day) and the offer date;
// a call offer two, the day the issuer gives notice by and the offer
// date; every other event its own day. The synthetic universe's scenario
// (rating changes, missed payments, defaults) keeps its source, so the
// screen marks it as synthetic.
import type { CalendarEventKind } from "@ghostjima/stoa-react";
import type { EventKind, HoldingEvent } from "../data/events";
import { dayToIso } from "../data/market";

/** What a calendar entry marks: a payment or a scenario event on its day,
 * or one of the days of an offer. */
export type CalendarRole = "event" | "window_opens" | "deadline" | "offer" | "notice";

export type CalendarEntry = {
  /** Stable: the holding, the event's place in its list, and the role. */
  key: string;
  /** The issue held. */
  id: string;
  date: string;
  day: number;
  kind: CalendarEventKind;
  role: CalendarRole;
  event: HoldingEvent;
};

const KIND: Record<EventKind, CalendarEventKind> = {
  coupon: "coupon",
  amortisation: "amortisation",
  maturity: "maturity",
  put_offer: "offer",
  call_offer: "offer",
  rating_change: "rating",
  technical_default: "default",
  default_cured: "default",
  default: "default",
};

/** The calendar's entries for the holdings' events (in the holdings'
 * order) between two days, inclusive, by day. */
export function calendarEntries(ids: readonly string[], events: readonly (readonly HoldingEvent[])[], from: number, to: number): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  ids.forEach((id, k) => {
    (events[k] ?? []).forEach((e, n) => {
      const at = (day: number, role: CalendarRole) => {
        if (day < from || day > to) return;
        out.push({ key: `${id}-${n}-${role}`, id, date: dayToIso(day), day, kind: KIND[e.kind], role, event: e });
      };
      if (e.kind === "put_offer") {
        if (e.windowFrom !== null) at(e.windowFrom, "window_opens");
        if (e.windowTo !== null) at(e.windowTo, "deadline");
        at(e.day, "offer");
      } else if (e.kind === "call_offer") {
        if (e.noticeDay !== null) at(e.noticeDay, "notice");
        at(e.day, "offer");
      } else at(e.day, "event");
    });
  });
  return out.sort((a, b) => a.day - b.day);
}

/** The first day with an entry on or after a day, as an ISO date; null
 * when there is none. */
export function nextEntryDate(entries: readonly CalendarEntry[], from: number): string | null {
  return entries.find((e) => e.day >= from)?.date ?? null;
}

/** How the events are shown: by date (the list), or on a calendar. */
export type EventsView = "list" | "calendar";

/** The view in ?ev=, the list when the link names none. */
export function readView(params: URLSearchParams): EventsView {
  return params.get("ev") === "calendar" ? "calendar" : "list";
}

/** Writes the view to ?ev=, left out for the list. */
export function writeView(params: URLSearchParams, view: EventsView): void {
  if (view === "list") params.delete("ev");
  else params.set("ev", view);
}
