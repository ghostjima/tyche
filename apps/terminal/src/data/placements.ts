// The placements of the synthetic universe as tyche-market writes them
// (placementsJson): new issues of its fictional issuers placed by
// book-building around the valuation date, each with its book's window,
// its coupon guidance, and, once the book has closed, the final coupon
// and the share of a request allotted. Days are offsets from the
// valuation date. Nothing here is a real placement.
import { OUTLOOKS, PLACES, RATINGS, SECTORS, type Outlook, type Place, type Rating, type Sector } from "./issues";

export const BOOK_STATES = ["upcoming", "open", "closed"] as const;
export type BookState = (typeof BOOK_STATES)[number];

export type Placement = {
  ticker: string;
  /** The issuer: its code, place and line of business. */
  issuer: { code: string; place: Place; sector: Exclude<Sector, "government"> };
  /** The issuer's synthetic rating and outlook. */
  rating: Rating;
  outlook: Outlook;
  state: BookState;
  /** The book's first and last working days, and the settlement. */
  bookOpen: number;
  bookClose: number;
  settlement: number;
  /** YYYY-MM-DD. */
  maturity: string;
  termYears: number;
  periodDays: number;
  /** Face value offered, roubles. */
  size: number;
  /** The coupon guidance, percent a year. */
  guidanceLowPct: number;
  guidanceHighPct: number;
  /** Once the book has closed: the requests over the size, the final
   * coupon, percent a year, and the share of a request without a coupon
   * limit that was allotted, percent. */
  demand: number | null;
  finalCouponPct: number | null;
  allottedPct: number | null;
};

/** The request the allotment is told for, roubles of face value
 * (tyche-market's INDICATIVE_REQUEST). */
export const INDICATIVE_REQUEST = 1_000_000;
/** The rules of the synthetic universe (tyche-market's placements): the
 * guidance's step, percentage points; the demand, a multiple of the
 * size, at which the final coupon reaches the bottom of the guidance;
 * working days from the book's close to the settlement. */
export const GUIDANCE_STEP_PCT = 0.05;
export const FULL_DEMAND = 2.5;
export const SETTLES_AFTER = 3;

type Raw = Omit<Placement, "issuer" | "rating" | "outlook" | "state"> & { issuer: string; place: string; sector: string; rating: string; outlook: string; state: string };

const has = <T extends string>(list: readonly T[], x: string): x is T => (list as readonly string[]).includes(x);

/** Reads placementsJson. Throws on a state, a place, a sector, a rating
 * or an outlook the interface has no words for, so a generator change
 * cannot show a blank. */
export function parsePlacements(json: string): Placement[] {
  const raw = JSON.parse(json) as Raw[];
  return raw.map((r) => {
    if (!has(BOOK_STATES, r.state)) throw new Error(`${r.ticker}: unknown state ${r.state}`);
    if (!has(PLACES, r.place) || !has(SECTORS, r.sector) || r.sector === "government") throw new Error(`${r.ticker}: unknown issuer ${r.place} ${r.sector}`);
    if (!has(RATINGS, r.rating)) throw new Error(`${r.ticker}: unknown rating ${r.rating}`);
    if (!has(OUTLOOKS, r.outlook)) throw new Error(`${r.ticker}: unknown outlook ${r.outlook}`);
    const sector: Exclude<Sector, "government"> = r.sector;
    return { ...r, issuer: { code: r.issuer, place: r.place, sector }, rating: r.rating, outlook: r.outlook, state: r.state };
  });
}
