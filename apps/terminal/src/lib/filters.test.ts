import { describe, expect, it } from "vitest";
import { MARKET } from "../data/market";
import { BONDS } from "../data/universe.testing";
import { twinEngine } from "../engine/twin";
import { strings } from "../i18n";
import { applyQuery, chipCounts, EMPTY_QUERY, sortItems, type Item } from "./filters";
import { searchTexts } from "./names";

const items: Item[] = BONDS.map((bond) => {
  const r = twinEngine.derive_bond(bond.issue, MARKET);
  if (!("ok" in r)) throw new Error(bond.id);
  return { bond, derived: r.ok };
});
const name = (b: Item["bond"]) => [b.issuer.kind === "government" ? "Synthetic Treasury" : `${b.issuer.place} ${b.issuer.sector}`];
const N = items.length;
const GOV = 34;

describe("filters", () => {
  it("no query keeps every issue", () => {
    expect(applyQuery(items, EMPTY_QUERY, name)).toHaveLength(N);
  });

  it("chips in one group widen the list, chips in two groups narrow it", () => {
    const fixed = applyQuery(items, { chips: ["fixed"], search: "" }, name).length;
    const floater = applyQuery(items, { chips: ["floater"], search: "" }, name).length;
    const linker = applyQuery(items, { chips: ["linker"], search: "" }, name).length;
    expect(fixed + floater + linker).toBe(N);
    expect(applyQuery(items, { chips: ["fixed", "floater"], search: "" }, name)).toHaveLength(fixed + floater);
    // Synthetic government floaters: four on the key rate and four on RUONIA.
    const govFloaters = applyQuery(items, { chips: ["gov", "floater"], search: "" }, name);
    expect(govFloaters.length).toBe(8);
    expect(govFloaters.every((i) => i.bond.issuer.kind === "government" && i.bond.issue.couponType === "floater")).toBe(true);
    expect(govFloaters.filter((i) => i.bond.coupon.kind === "ruonia")).toHaveLength(4);
  });

  it("features must all match", () => {
    const both = applyQuery(items, { chips: ["amortising", "offer"], search: "" }, name);
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((i) => i.bond.issue.amortization.length > 0 && i.derived.offerDay !== null)).toBe(true);
  });

  it("a chip's count is the list it would give", () => {
    const counts = chipCounts(items, { chips: ["gov"], search: "" }, name);
    expect(counts.gov).toBe(GOV);
    expect(counts.corporate).toBe(N - GOV);
    expect(counts.floater).toBe(8);
    expect(counts.linker).toBe(3);
    expect(counts.offer).toBe(applyQuery(items, { chips: ["gov", "offer"], search: "" }, name).length);
  });

  it("search matches the name and the ticker, ignoring case", () => {
    expect(applyQuery(items, { chips: [], search: "sg-2" }, name).map((i) => i.bond.id)).toEqual(["SG-201", "SG-206", "SG-207", "SG-211"]);
    expect(applyQuery(items, { chips: [], search: "VOLGA" }, name).length).toBeGreaterThan(0);
    expect(applyQuery(items, { chips: [], search: "no such issuer" }, name)).toHaveLength(0);
  });

  it("search reads a ticker with or without its separators, and the government series in Russian", () => {
    const ru = (b: Item["bond"]) => searchTexts(b, strings.ru);
    const ids = (search: string, texts = ru) => applyQuery(items, { chips: [], search }, texts).map((i) => i.bond.id);
    for (const search of ["СГ 143", "СГ-143", "сг143", "SG-143", "sg 143"]) expect(ids(search), search).toEqual(["SG-143"]);
    for (const search of ["kamf 01", "kamf01", "KAMF-01"]) expect(ids(search), search).toEqual(["KAMF-01"]);
    expect(ids("СГ 999")).toEqual([]);
    // Every word must match: an issuer's name and a ticker's number.
    expect(ids("Кама 01").every((id) => id.startsWith("KAM"))).toBe(true);
    expect(ids("Кама 01").length).toBeGreaterThan(0);
  });

  it("sorts by yield, maturity and rating", () => {
    const byYield = sortItems(items, "yield");
    expect(byYield[0]!.derived.yieldEvent).toBeGreaterThanOrEqual(byYield[N - 1]!.derived.yieldEvent);
    const byMaturity = sortItems(items, "maturity");
    expect(byMaturity[0]!.derived.maturityDay).toBeLessThanOrEqual(byMaturity[N - 1]!.derived.maturityDay);
    expect(sortItems(items, "rating")[0]!.bond.rating).toBe("AAA");
  });
});
