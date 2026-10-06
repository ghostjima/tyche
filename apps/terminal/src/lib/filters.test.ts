import { describe, expect, it } from "vitest";
import { BONDS } from "../data/issues";
import { MARKET } from "../data/market";
import { twinEngine } from "../engine/twin";
import { strings } from "../i18n";
import { applyQuery, chipCounts, EMPTY_QUERY, sortItems, type Item } from "./filters";
import { searchTexts } from "./names";

const items: Item[] = BONDS.map((bond) => {
  const r = twinEngine.derive_bond(bond.issue, MARKET);
  if (!("ok" in r)) throw new Error(bond.id);
  return { bond, derived: r.ok };
});
const name = (b: Item["bond"]) => [b.issuer.kind === "ofz" ? "Federal loan" : `${b.issuer.place} ${b.issuer.industry}`];

describe("filters", () => {
  it("no query keeps every issue", () => {
    expect(applyQuery(items, EMPTY_QUERY, name)).toHaveLength(60);
  });

  it("chips in one group widen the list, chips in two groups narrow it", () => {
    const fixed = applyQuery(items, { chips: ["fixed"], search: "" }, name).length;
    const floater = applyQuery(items, { chips: ["floater"], search: "" }, name).length;
    expect(applyQuery(items, { chips: ["fixed", "floater"], search: "" }, name)).toHaveLength(fixed + floater);
    const ofzFloaters = applyQuery(items, { chips: ["ofz", "floater"], search: "" }, name);
    expect(ofzFloaters.length).toBe(3);
    expect(ofzFloaters.every((i) => i.bond.issuer.kind === "ofz" && i.bond.issue.couponType === "floater")).toBe(true);
  });

  it("features must all match", () => {
    const both = applyQuery(items, { chips: ["amortising", "offer"], search: "" }, name);
    expect(both.every((i) => i.bond.issue.amortization.length > 0 && i.derived.offerDay !== null)).toBe(true);
  });

  it("a chip's count is the list it would give", () => {
    const query = { chips: ["ofz"] as const, search: "" };
    const counts = chipCounts(items, { ...query, chips: [...query.chips] }, name);
    expect(counts.ofz).toBe(10);
    expect(counts.corporate).toBe(50);
    expect(counts.floater).toBe(3);
    expect(counts.offer).toBe(applyQuery(items, { chips: ["ofz", "offer"], search: "" }, name).length);
  });

  it("search matches the name and the ticker, ignoring case", () => {
    expect(applyQuery(items, { chips: [], search: "ofz-292" }, name).map((i) => i.bond.id)).toEqual(["OFZ-29252", "OFZ-29259", "OFZ-29266"]);
    expect(applyQuery(items, { chips: [], search: "VOLGA" }, name).length).toBeGreaterThan(0);
    expect(applyQuery(items, { chips: [], search: "no such issuer" }, name)).toHaveLength(0);
  });

  it("search reads a ticker with or without its separators, and OFZ in Russian", () => {
    const ru = (b: Item["bond"]) => searchTexts(b, strings.ru);
    const ids = (search: string, texts = ru) => applyQuery(items, { chips: [], search }, texts).map((i) => i.bond.id);
    for (const search of ["ОФЗ 26217", "ОФЗ-26217", "офз26217", "OFZ-26217", "ofz 26217"]) expect(ids(search), search).toEqual(["OFZ-26217"]);
    for (const search of ["okad 01", "okad01", "OKAD-01"]) expect(ids(search), search).toEqual(["OKAD-01"]);
    expect(ids("ОФЗ 99999")).toEqual([]);
    // Every word must match: an issuer's name and a ticker's number.
    expect(ids("Ока 01").every((id) => id.startsWith("OKA"))).toBe(true);
    expect(ids("Ока 01").length).toBeGreaterThan(0);
  });

  it("sorts by yield, maturity and rating", () => {
    const byYield = sortItems(items, "yield");
    expect(byYield[0]!.derived.yieldEvent).toBeGreaterThanOrEqual(byYield[59]!.derived.yieldEvent);
    const byMaturity = sortItems(items, "maturity");
    expect(byMaturity[0]!.derived.maturityDay).toBeLessThanOrEqual(byMaturity[59]!.derived.maturityDay);
    expect(sortItems(items, "rating")[0]!.bond.rating).toBe("AAA");
  });
});
