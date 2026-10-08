// The placements as the app reads them from tyche-market's WebAssembly
// build: the native build's, bit for bit, and read without a blank.
import { describe, expect, it } from "vitest";
import { SEED, VALUATION_DATE } from "./market";
import { parsePlacements } from "./placements";
import { BONDS, fallbackInputs, placementsJson } from "./universe.testing";
import { allottedAmount, countdownDay, readPlacementsOpen, writePlacementsOpen } from "../lib/placements";
import { workingDaysUntil } from "../lib/workdays";

/** FNV-1a, 64 bits, as tyche-market's json::fnv1a. */
function fnv1a(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(text)) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/** The digest tests/placements.rs pins for the native build. */
const DIGEST = "e6a8b0f082769cb2";

describe("the placements", () => {
  it("are the native build's, bit for bit", () => {
    expect(fnv1a(placementsJson(SEED, fallbackInputs()))).toBe(DIGEST);
  });

  it("read with words for every state, issuer, rating and outlook: one closed, two open, one to come", () => {
    const all = parsePlacements(placementsJson());
    expect(all.map((p) => p.state).sort()).toEqual(["closed", "open", "open", "upcoming"]);
    const tickers = new Set(BONDS.map((b) => b.id));
    for (const p of all) {
      expect(tickers.has(p.ticker), p.ticker).toBe(false);
      expect(p.ticker.startsWith(p.issuer.code), p.ticker).toBe(true);
      expect(p.guidanceLowPct).toBeLessThan(p.guidanceHighPct);
      expect(p.maturity > VALUATION_DATE).toBe(true);
    }
    expect(() => parsePlacements('[{"ticker":"X","state":"pending"}]')).toThrow(/unknown state/);
  });

  it("count a book down to its close while it is open, to its opening before, and not once it has closed", () => {
    for (const p of parsePlacements(placementsJson())) {
      const day = countdownDay(p);
      if (p.state === "closed") expect(day).toBeNull();
      else {
        expect(day).toBe(p.state === "open" ? p.bookClose : p.bookOpen);
        expect(workingDaysUntil(day!)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("tell what an indicative request was allotted, in whole thousands, once the book has closed", () => {
    const closed = parsePlacements(placementsJson()).find((p) => p.state === "closed")!;
    expect(closed.finalCouponPct).toBeGreaterThanOrEqual(closed.guidanceLowPct);
    expect(closed.finalCouponPct).toBeLessThanOrEqual(closed.guidanceHighPct);
    const amount = allottedAmount(closed)!;
    expect(amount % 1000).toBe(0);
    expect(amount).toBeLessThanOrEqual(1_000_000);
    expect(Math.abs(amount - 10_000 * closed.allottedPct!)).toBeLessThan(1000);
    expect(allottedAmount({ ...closed, allottedPct: null })).toBeNull();
  });

  it("are open in the link with ?pl=1, and the link leaves it out when they are closed", () => {
    expect(readPlacementsOpen(new URLSearchParams("pl=1"))).toBe(true);
    expect(readPlacementsOpen(new URLSearchParams("pl=0"))).toBe(false);
    const p = new URLSearchParams("lang=en");
    writePlacementsOpen(p, true);
    expect(p.toString()).toBe("lang=en&pl=1");
    writePlacementsOpen(p, false);
    expect(p.toString()).toBe("lang=en");
  });
});
