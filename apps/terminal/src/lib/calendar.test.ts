import { describe, expect, it } from "vitest";
import { parseEvents } from "../data/events";
import { dayToIso } from "../data/market";
import { BONDS, eventsJson } from "../data/universe.testing";
import { calendarEntries, nextEntryDate, readView, writeView } from "./calendar";

/** The e2e portfolio: two put offers, a floater with amortisation, a
 * missed payment that is made, one that ends in a default, and rating
 * changes behind and ahead. */
const HELD = ["VTKT-02", "KAMF-01", "BELM-01", "IRTD-01", "ENSD-03", "OBRC-01"];
const events = HELD.map((id) => parseEvents(eventsJson(BONDS.findIndex((b) => b.id === id), 10)));

describe("the holdings' events on a calendar", () => {
  const entries = calendarEntries(HELD, events, -180, 365);

  it("puts a put offer on the first day of its window, on its deadline and on its date", () => {
    const put = events[0]!.find((e) => e.kind === "put_offer")!;
    const days = entries.filter((c) => c.id === "VTKT-02" && c.event === put);
    expect(days.map((c) => [c.role, c.day])).toEqual([
      ["window_opens", put.windowFrom],
      ["deadline", put.windowTo],
      ["offer", put.day],
    ]);
    expect(days.every((c) => c.kind === "offer")).toBe(true);
    expect(days[1]!.date).toBe(dayToIso(put.windowTo!));
  });

  it("keeps every event of the period once, by day, with the calendar's kind for each", () => {
    const inPeriod = events.flatMap((list) => list.filter((e) => e.day >= -180 && e.day <= 365));
    const own = entries.filter((c) => c.role === "event" || c.role === "offer");
    expect(own).toHaveLength(inPeriod.length);
    for (let k = 1; k < entries.length; k++) expect(entries[k]!.day).toBeGreaterThanOrEqual(entries[k - 1]!.day);
    expect(new Set(entries.map((c) => c.key)).size).toBe(entries.length);
    const kindOf = (kind: string) => new Set(entries.filter((c) => c.event.kind === kind).map((c) => c.kind));
    expect(kindOf("coupon")).toEqual(new Set(["coupon"]));
    expect(kindOf("amortisation")).toEqual(new Set(["amortisation"]));
    expect(kindOf("rating_change")).toEqual(new Set(["rating"]));
    for (const kind of ["technical_default", "default_cured", "default"]) expect(kindOf(kind), kind).toEqual(new Set(["default"]));
    // The scenario's events, the future defaults among them, stay in, with
    // their source.
    expect(entries.some((c) => c.event.kind === "default" && c.day > 0 && c.event.source === "scenario")).toBe(true);
  });

  it("leaves out what falls outside the period", () => {
    const short = calendarEntries(HELD, events, 0, 30);
    expect(short.every((c) => c.day >= 0 && c.day <= 30)).toBe(true);
    expect(short.length).toBeLessThan(entries.length);
  });

  it("finds the next day with an entry", () => {
    const next = nextEntryDate(entries, 0)!;
    expect(next >= dayToIso(0)).toBe(true);
    expect(entries.some((c) => c.date === next)).toBe(true);
    expect(nextEntryDate(entries, 10_000)).toBeNull();
  });
});

describe("the events' view in the link", () => {
  it("is the list unless ?ev= asks for the calendar, and the list is left out", () => {
    expect(readView(new URLSearchParams(""))).toBe("list");
    expect(readView(new URLSearchParams("ev=calendar"))).toBe("calendar");
    expect(readView(new URLSearchParams("ev=grid"))).toBe("list");
    const p = new URLSearchParams("hold=KAMF-01*30");
    writeView(p, "calendar");
    expect(p.toString()).toBe("hold=KAMF-01*30&ev=calendar");
    writeView(p, "list");
    expect(p.toString()).toBe("hold=KAMF-01*30");
  });
});
