// A holding's events as tyche-market writes them (eventsJson): the
// payments from the issue's terms, its offer with the window to act in,
// and the synthetic universe's scenario of rating changes and defaults.
// Days are offsets from the valuation date.
import { RATINGS, type Rating } from "./issues";

export const EVENT_KINDS = [
  "coupon",
  "amortisation",
  "maturity",
  "put_offer",
  "call_offer",
  "rating_change",
  "technical_default",
  "default_cured",
  "default",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type HoldingEvent = {
  kind: EventKind;
  /** From the issue's terms, or the synthetic universe's scenario. */
  source: "terms" | "scenario";
  day: number;
  /** YYYY-MM-DD. */
  date: string;
  /** A payment per bond, and for the holding; 0 for an event with none. */
  perBond: number;
  amount: number;
  /** A floater's or a linker's coupon, at today's index. */
  projected: boolean;
  /** A put offer's window to ask for redemption, first and last working
   * day; the last is the deadline. */
  windowFrom: number | null;
  windowTo: number | null;
  /** A call offer: the day the issuer gives notice by. */
  noticeDay: number | null;
  ratingFrom: Rating | null;
  ratingTo: Rating | null;
};

const isKind = (x: string): x is EventKind => (EVENT_KINDS as readonly string[]).includes(x);
const isRating = (x: unknown): x is Rating => typeof x === "string" && (RATINGS as readonly string[]).includes(x);

/** Reads the generator's JSON; throws on a kind or a rating the interface
 * has no words for, so a generator change cannot show a blank. */
export function parseEvents(json: string): HoldingEvent[] {
  const raw = JSON.parse(json) as (Omit<HoldingEvent, "kind" | "ratingFrom" | "ratingTo"> & { kind: string; ratingFrom: unknown; ratingTo: unknown })[] | null;
  if (raw === null) throw new Error("no such issue");
  return raw.map((e) => {
    if (!isKind(e.kind)) throw new Error(`unknown event ${e.kind}`);
    if (e.ratingFrom !== null && !isRating(e.ratingFrom)) throw new Error(`unknown rating ${String(e.ratingFrom)}`);
    if (e.ratingTo !== null && !isRating(e.ratingTo)) throw new Error(`unknown rating ${String(e.ratingTo)}`);
    return { ...e, kind: e.kind, ratingFrom: e.ratingFrom, ratingTo: e.ratingTo };
  });
}
