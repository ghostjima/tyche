// A holding's events as the app reads them from tyche-market's
// WebAssembly build: the same events as the Rust crate's (one digest over
// every issue), read without a blank.
import { describe, expect, it } from "vitest";
import { SEED } from "./market";
import { parseEvents } from "./events";
import { BONDS, eventsJson, fallbackInputs } from "./universe.testing";

/** FNV-1a, 64 bits, as tyche-market's json::fnv1a. */
function fnv1a(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(text)) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/** The digest tests/holding.rs pins for the native build. */
const DIGEST = "be90933fcacc3bf3";

describe("a holding's events", () => {
  it("are the native build's, bit for bit", () => {
    const inputs = fallbackInputs();
    const all = BONDS.map((_, i) => eventsJson(i, 7, SEED, inputs)).join("\n");
    expect(fnv1a(all)).toBe(DIGEST);
  });

  it("read with a word for every kind and rating, sorted by day, for every issue", () => {
    const kinds = new Set<string>();
    BONDS.forEach((b, i) => {
      const list = parseEvents(eventsJson(i, 10));
      expect(list.length, b.id).toBeGreaterThan(0);
      for (let k = 1; k < list.length; k++) expect(list[k]!.day).toBeGreaterThanOrEqual(list[k - 1]!.day);
      for (const e of list) kinds.add(e.kind);
      // The amounts are for ten bonds.
      for (const e of list) expect(Math.abs(e.amount - 10 * e.perBond)).toBeLessThan(0.01);
    });
    expect(kinds.size).toBe(9);
    expect(() => parseEvents("null")).toThrow();
    expect(() => parseEvents('[{"kind":"split"}]')).toThrow();
  });
});
