// Sixty fictional issues, generated from a seeded random sequence so every
// visitor and every test sees the same list: ten federal loan bonds (OFZ)
// and fifty corporate issues; fixed coupons, floaters on the key rate,
// amortising issues and issues with an offer. Each price is set from a
// yield drawn for the issue's rating, priced to the offer where there is
// one, so the yields the engine finds land in a plausible range.
import { build_cash_flow, coupon_schedule, price_from_yield, type Amortization, type Issue } from "@tyche/yield-twin";
import { KEY_RATE_PCT, dayToIso } from "./market";

export const RATINGS = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B"] as const;
export type Rating = (typeof RATINGS)[number];

export const PLACES = [
  "volga", "kama", "oka", "neva", "ob", "amur", "baikal", "ural",
  "don", "angara", "irtysh", "lena", "pechora", "onega", "kuban", "yenisei",
] as const;
export type Place = (typeof PLACES)[number];

export const INDUSTRIES = ["logistics", "energy", "retail", "metals", "leasing", "agro", "development", "telecom"] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** Who issued it: the federal government, or a fictional company named
 * after a river or a region and its line of business. */
export type Issuer = { kind: "ofz" } | { kind: "corporate"; place: Place; industry: Industry };

export type Bond = {
  /** The ticker: a code in Latin letters and digits, the same in every
   * language. */
  id: string;
  issuer: Issuer;
  rating: Rating;
  /** What the engine takes. */
  issue: Issue;
};

const PLACE_CODES: Record<Place, string> = {
  volga: "VLG", kama: "KAM", oka: "OKA", neva: "NEV", ob: "OBR", amur: "AMR", baikal: "BKL", ural: "URL",
  don: "DON", angara: "ANG", irtysh: "IRT", lena: "LEN", pechora: "PCH", onega: "ONG", kuban: "KUB", yenisei: "ENS",
};
const INDUSTRY_CODES: Record<Industry, string> = {
  logistics: "L", energy: "E", retail: "R", metals: "M", leasing: "F", agro: "A", development: "D", telecom: "T",
};

/** mulberry32: a small, well-known 32-bit generator; enough for fixtures. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type Shape = {
  issuer: Issuer;
  id: string;
  floater: boolean;
  amortising: boolean;
  offer: boolean;
};

/** Generates the list. Pure: the same seed gives the same issues. */
export function generateBonds(seed = 20261004): Bond[] {
  const rnd = mulberry32(seed);
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const logUniform = (lo: number, hi: number) => Math.exp(uniform(Math.log(lo), Math.log(hi)));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;

  const drawRating = (): Rating => {
    // Skewed to the middle of the scale, as a broker's list is.
    const weights = [2, 3, 4, 4, 5, 6, 6, 6, 6, 5, 4, 3, 3, 2, 1];
    let x = rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      x -= weights[i] as number;
      if (x < 0) return RATINGS[i] as Rating;
    }
    return "BBB";
  };
  const bucket = (r: Rating) => {
    const i = RATINGS.indexOf(r);
    return i <= 3 ? 0 : i <= 6 ? 1 : i <= 9 ? 2 : i <= 12 ? 3 : 4;
  };
  // Annual effective yields by rating bucket, percent.
  const YIELDS: [number, number][] = [[12.5, 15.5], [15, 18], [17, 20], [19, 22], [21, 24]];
  const SPREADS: [number, number][] = [[0.8, 1.8], [1.8, 3], [3, 4.5], [4.5, 6], [6, 8]];

  const shapes: Shape[] = [];
  // Ten federal loan bonds: six fixed (OFZ-PD), three floaters (OFZ-PK),
  // one amortising (OFZ-AD). Series numbers are invented.
  for (let i = 0; i < 10; i++) {
    const floater = i >= 6 && i < 9;
    const amortising = i === 9;
    const series = floater ? 29_000 : amortising ? 46_000 : 26_000;
    shapes.push({ issuer: { kind: "ofz" }, id: `OFZ-${series + 210 + i * 7}`, floater, amortising, offer: false });
  }
  // Fifty corporate issues from thirty companies.
  const companies: { place: Place; industry: Industry }[] = [];
  for (let i = 0; i < 30; i++) {
    companies.push({ place: PLACES[i % PLACES.length] as Place, industry: INDUSTRIES[(i * 3 + Math.floor(i / PLACES.length)) % INDUSTRIES.length] as Industry });
  }
  const series = new Map<string, number>();
  for (let i = 0; i < 50; i++) {
    const company = companies[i % companies.length]!;
    const code = PLACE_CODES[company.place] + INDUSTRY_CODES[company.industry];
    const n = (series.get(code) ?? 0) + 1;
    series.set(code, n);
    shapes.push({
      issuer: { kind: "corporate", ...company },
      id: `${code}-${String(n).padStart(2, "0")}`,
      floater: rnd() < 0.18,
      amortising: rnd() < 0.22,
      offer: rnd() < 0.24,
    });
  }
  // Every kind the screen shows, at least a few times.
  for (const i of [14, 31, 47]) shapes[i]!.floater = true;
  for (const i of [19, 38, 55]) shapes[i]!.amortising = true;
  for (const i of [12, 26, 44]) shapes[i]!.offer = true;

  return shapes.map((shape): Bond => {
    const ofz = shape.issuer.kind === "ofz";
    const nominal = 1000;
    const rating: Rating = ofz ? "AAA" : drawRating();
    const period = ofz ? pick([182, 182, 91]) : pick([182, 91, 91, 30]);
    const termDays = Math.round(logUniform(120, 3650));
    const couponDays = coupon_schedule(termDays, period);
    const daysSinceLast = period - (couponDays[0] as number);

    const [ylo, yhi] = ofz ? [12, 14.5] : YIELDS[bucket(rating)]!;
    let targetPct = uniform(ylo, yhi);
    let couponRatePct = 0;
    let spreadPct = 0;
    if (shape.floater) {
      const [slo, shi] = ofz ? [0.2, 1] : SPREADS[bucket(rating)]!;
      spreadPct = round2(uniform(slo, shi));
      // A floater trades near its coupon: key rate plus spread, give or
      // take half a point.
      targetPct = KEY_RATE_PCT + spreadPct + uniform(-0.5, 0.8);
    } else {
      couponRatePct = round2(Math.min(24, Math.max(6.5, targetPct + uniform(-3, 1.5))));
    }
    const ratePct = shape.floater ? KEY_RATE_PCT + spreadPct : couponRatePct;

    const amortization: Amortization[] = [];
    const amortDays: number[] = [];
    const amortFracs: number[] = [];
    if (shape.amortising && couponDays.length >= 3) {
      const tranches = Math.min(couponDays.length, 4);
      for (let i = couponDays.length - tranches; i < couponDays.length; i++) {
        const day = couponDays[i] as number;
        amortization.push({ date: dayToIso(day), fractionPct: 100 / tranches });
        if (i < couponDays.length - 1) {
          amortDays.push(day);
          amortFracs.push(1 / tranches);
        }
      }
    }

    const offers: string[] = [];
    let offerDay = 0;
    if (shape.offer && couponDays.length >= 3) {
      const at = Math.max(0, Math.min(couponDays.length - 2, Math.floor(couponDays.length * uniform(0.3, 0.7))));
      offerDay = couponDays[at] as number;
      offers.push(dayToIso(offerDay));
    }

    // Priced to the nearest exit: the offer where there is one.
    const triples = build_cash_flow(nominal, period, couponDays, couponDays.map(() => ratePct), amortDays, amortFracs, offerDay, offerDay > 0 ? 1 : 0, 0);
    const amounts: number[] = [];
    const days: number[] = [];
    for (let i = 0; i + 2 < triples.length; i += 3) {
      days.push(triples[i] as number);
      amounts.push((triples[i + 1] as number) + (triples[i + 2] as number));
    }
    const couponAmount = (((nominal * ratePct) / 100) * period) / 365;
    const accrued = (couponAmount * Math.max(daysSinceLast, 0)) / period;
    const dirty = price_from_yield(amounts, days, targetPct / 100);
    const pricePct = round2(((dirty - accrued) / nominal) * 100);

    return {
      id: shape.id,
      issuer: shape.issuer,
      rating,
      issue: {
        nominal,
        pricePct,
        // The engine computes the accrued interest from the schedule.
        accrued: null,
        couponType: shape.floater ? "floater" : "fixed",
        couponRatePct,
        spreadPct,
        periodDays: period,
        maturity: dayToIso(termDays),
        offers,
        amortization,
      },
    };
  });
}

export const BONDS: readonly Bond[] = generateBonds();

export function ratingIndex(r: Rating): number {
  return RATINGS.indexOf(r);
}
