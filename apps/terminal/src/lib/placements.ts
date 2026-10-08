// The placements' card: whether it is open (in the URL, ?pl=1), the day a
// book's countdown runs to, and what an indicative request was allotted.
import { INDICATIVE_REQUEST, type Placement } from "../data/placements";

/** Whether ?pl= opens the placements. */
export function readPlacementsOpen(params: URLSearchParams): boolean {
  return params.get("pl") === "1";
}

/** Writes ?pl=1 while the placements are open, and leaves it out when
 * they are not. */
export function writePlacementsOpen(params: URLSearchParams, open: boolean): void {
  if (open) params.set("pl", "1");
  else params.delete("pl");
}

/** The day a book's countdown runs to: its close while it is open, its
 * opening while it is to come; none once it has closed. */
export function countdownDay(p: Placement): number | null {
  switch (p.state) {
    case "open":
      return p.bookClose;
    case "upcoming":
      return p.bookOpen;
    case "closed":
      return null;
  }
}

/** What an indicative request without a coupon limit was allotted,
 * roubles of face value, to a whole bond of a thousand; null until the
 * book has closed. */
export function allottedAmount(p: Placement): number | null {
  if (p.allottedPct === null) return null;
  return Math.floor((INDICATIVE_REQUEST * p.allottedPct) / 100 / 1000) * 1000;
}
