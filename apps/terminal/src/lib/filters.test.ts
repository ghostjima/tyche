import { describe, expect, it } from "vitest";
import { MARKET, VALUATION_DATE } from "../data/market";
import { BONDS } from "../data/universe.testing";
import { twinEngine } from "../engine/twin";
import { strings } from "../i18n";
import {
  CHIP_IDS,
  EMPTY_QUERY,
  GOAL_CHIPS,
  GROUPS,
  activeGoal,
  applyQuery,
  chipCounts,
  defaultMonth,
  goalQuery,
  isMonth,
  monthEndDay,
  readListState,
  sortItems,
  writeListState,
  type ChipId,
  type Item,
  type Query,
} from "./filters";
import { LIQUID_MAX_SPREAD_BP, LIQUID_MIN_DEPTH, isLiquid } from "./liquidity";
import { searchTexts } from "./names";

const items: Item[] = BONDS.map((bond) => {
  const r = twinEngine.derive_bond(bond.issue, MARKET);
  if (!("ok" in r)) throw new Error(bond.id);
  return { bond, derived: r.ok };
});
const name = (b: Item["bond"]) => [b.issuer.kind === "government" ? "Synthetic Treasury" : `${b.issuer.place} ${b.issuer.sector}`];
const N = items.length;
const GOV = 34;
const q = (chips: ChipId[], extra: Partial<Query> = {}): Query => ({ ...EMPTY_QUERY, chips, ...extra });
const run = (query: Query) => applyQuery(items, query, name, VALUATION_DATE);

describe("filters", () => {
  it("no query keeps every issue", () => {
    expect(run(EMPTY_QUERY)).toHaveLength(N);
  });

  it("every group splits the universe: each issue matches exactly one chip of it", () => {
    for (const group of GROUPS) {
      const sizes = group.chips.map((c) => run(q([c])).length);
      expect(sizes.reduce((a, b) => a + b, 0), group.id).toBe(N);
      for (const [i, size] of sizes.entries()) expect(size, `${group.id}.${group.chips[i]}`).toBeGreaterThan(0);
    }
  });

  it("chips in one group widen the list, chips in two groups narrow it", () => {
    const fixed = run(q(["fixed"])).length;
    const keyRate = run(q(["keyRate"])).length;
    expect(run(q(["fixed", "keyRate"]))).toHaveLength(fixed + keyRate);
    // Synthetic government floaters: four on the key rate and four on RUONIA.
    const govKeyRate = run(q(["gov", "keyRate"]));
    expect(govKeyRate).toHaveLength(4);
    expect(govKeyRate.every((i) => i.bond.issuer.kind === "government" && i.bond.coupon.kind === "key_rate")).toBe(true);
    expect(run(q(["gov", "ruonia"]))).toHaveLength(4);
  });

  it("the professional filters read the issue as the screen shows it", () => {
    for (const i of run(q(["yieldMid"]))) expect(i.derived.yieldEvent >= 0.14 && i.derived.yieldEvent < 0.18).toBe(true);
    for (const i of run(q(["durShort"]))) expect(i.derived.macaulay).toBeLessThanOrEqual(1);
    for (const i of run(q(["ratingHigh"]))) expect(["AAA", "AA+", "AA", "AA-"]).toContain(i.bond.rating);
    for (const i of run(q(["monthly"]))) expect(i.bond.issue.periodDays).toBe(30);
    for (const i of run(q(["put"]))) expect(i.bond.offer?.kind).toBe("put");
    for (const i of run(q(["noAmortisation"]))) expect(i.bond.issue.amortization).toHaveLength(0);
    expect(run(q(["qualified"])).every((i) => i.bond.qualifiedOnly)).toBe(true);
    expect(run(q(["open"])).some((i) => i.bond.qualifiedOnly)).toBe(false);
  });

  it("an issue is liquid within both named thresholds of its synthetic book", () => {
    expect(LIQUID_MAX_SPREAD_BP).toBe(50);
    expect(LIQUID_MIN_DEPTH).toBe(10_000);
    const liquid = run(q(["liquid"]));
    expect(liquid.every((i) => i.bond.liquidity.spreadBp <= 50 && i.bond.liquidity.depth >= 10_000)).toBe(true);
    expect(run(q(["illiquid"])).every((i) => !isLiquid(i.bond))).toBe(true);
    expect(liquid.length).toBeGreaterThan(N / 2);
  });

  it("a chip's count is the list it would give", () => {
    const counts = chipCounts(items, q(["gov"]), name, VALUATION_DATE);
    expect(counts.gov).toBe(GOV);
    expect(counts.corporate).toBe(N - GOV);
    expect(counts.keyRate).toBe(4);
    expect(counts.linker).toBe(3);
    expect(counts.put).toBe(run(q(["gov", "put"])).length);
    // A date counts too.
    const by = defaultMonth(VALUATION_DATE);
    expect(chipCounts(items, q([], { by }), name, VALUATION_DATE).gov).toBe(run(q(["gov"], { by })).length);
  });

  it("by a date keeps what matures by the month's end, or can be sold back at a put by then", () => {
    expect(defaultMonth("2026-10-05")).toBe("2027-10");
    expect(monthEndDay("2026-10", "2026-10-05")).toBe(26);
    expect(monthEndDay("2027-02", "2026-10-05")).toBe(146);
    expect(isMonth("2027-10", "2026-10-05")).toBe(true);
    expect(isMonth("2026-09", "2026-10-05")).toBe(false);
    expect(isMonth("2027-13", "2026-10-05")).toBe(false);
    expect(isMonth("27-10", "2026-10-05")).toBe(false);
    const by = "2027-10";
    const end = monthEndDay(by, VALUATION_DATE);
    const kept = run(q([], { by }));
    expect(kept.length).toBeGreaterThan(0);
    for (const i of kept) expect(i.derived.maturityDay <= end || (i.bond.offer?.kind === "put" && i.derived.offerDay! <= end)).toBe(true);
    // A put offer by then counts; an issuer's call does not, since the
    // issuer decides.
    expect(kept.some((i) => i.derived.maturityDay > end && i.bond.offer?.kind === "put")).toBe(true);
    expect(kept.some((i) => i.derived.maturityDay > end && i.bond.offer?.kind === "call")).toBe(false);
    expect(run(q([], { by: "2050-12" }))).toHaveLength(N);
  });

  it("search matches the name and the ticker, ignoring case", () => {
    expect(run(q([], { search: "sg-2" })).map((i) => i.bond.id)).toEqual(["SG-201", "SG-206", "SG-207", "SG-211"]);
    expect(run(q([], { search: "VOLGA" })).length).toBeGreaterThan(0);
    expect(run(q([], { search: "no such issuer" }))).toHaveLength(0);
  });

  it("search reads a ticker with or without its separators, and the government series in Russian", () => {
    const ru = (b: Item["bond"]) => searchTexts(b, strings.ru);
    const ids = (search: string, texts = ru) => applyQuery(items, q([], { search }), texts, VALUATION_DATE).map((i) => i.bond.id);
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

describe("goals", () => {
  it("each goal sets its own chips, keeps the search, and leaves issues to show", () => {
    for (const goal of ["deposit", "income", "date"] as const) {
      const query = goalQuery(goal, q(["call"], { search: "a" }), VALUATION_DATE);
      expect(query.chips).toEqual(GOAL_CHIPS[goal]);
      expect(query.search).toBe("a");
      expect(activeGoal(query)).toBe(goal);
      expect(run({ ...query, search: "" }).length, goal).toBeGreaterThan(0);
    }
    expect(goalQuery("date", EMPTY_QUERY, VALUATION_DATE).by).toBe(defaultMonth(VALUATION_DATE));
    expect(goalQuery("deposit", q([], { by: "2027-01" }), VALUATION_DATE).by).toBeNull();
  });

  it("instead of a deposit: high ratings, up to a year's duration, a fixed or key-rate coupon, open to all, liquid", () => {
    const kept = run(goalQuery("deposit", EMPTY_QUERY, VALUATION_DATE));
    for (const { bond, derived } of kept) {
      expect(["AAA", "AA+", "AA", "AA-"]).toContain(bond.rating);
      expect(derived.macaulay).toBeLessThanOrEqual(1);
      expect(["fixed", "key_rate"]).toContain(bond.coupon.kind);
      expect(bond.qualifiedOnly).toBe(false);
      expect(isLiquid(bond)).toBe(true);
    }
    expect(kept.some((i) => i.bond.issuer.kind === "government")).toBe(true);
  });

  it("monthly income: monthly coupons, no offer, no amortisation", () => {
    for (const { bond, derived } of run(goalQuery("income", EMPTY_QUERY, VALUATION_DATE))) {
      expect(bond.issue.periodDays).toBe(30);
      expect(derived.offerDay).toBeNull();
      expect(bond.issue.amortization).toHaveLength(0);
    }
  });

  it("a goal is on only while its filters are exactly what it set", () => {
    expect(activeGoal(EMPTY_QUERY)).toBeNull();
    const deposit = goalQuery("deposit", EMPTY_QUERY, VALUATION_DATE);
    expect(activeGoal({ ...deposit, chips: [...deposit.chips].reverse() })).toBe("deposit");
    expect(activeGoal({ ...deposit, chips: deposit.chips.slice(1) })).toBeNull();
    expect(activeGoal({ ...deposit, chips: [...deposit.chips, "gov"] })).toBeNull();
    // A date set is "Money by a date", whatever the chips.
    expect(activeGoal({ ...deposit, by: "2027-03" })).toBe("date");
  });
});

describe("the list's state in the URL", () => {
  it("round-trips the chips, the search, the date and the sort, and leaves other parameters", () => {
    const params = new URLSearchParams("lang=ru&issue=SG-143");
    const query: Query = { chips: ["liquid", "gov", "monthly"], search: "кама 01", by: "2027-05" };
    writeListState(params, query, "maturity");
    expect(params.get("lang")).toBe("ru");
    expect(params.get("issue")).toBe("SG-143");
    // The chips in a fixed order, so a link reads the same however it was built.
    expect(params.getAll("f")).toEqual(["gov", "monthly", "liquid"]);
    expect(params.toString()).toBe("lang=ru&issue=SG-143&q=%D0%BA%D0%B0%D0%BC%D0%B0+01&f=gov&f=monthly&f=liquid&by=2027-05&sort=maturity");
    const back = readListState(params, VALUATION_DATE);
    expect(back.sort).toBe("maturity");
    expect(back.query.search).toBe("кама 01");
    expect(back.query.by).toBe("2027-05");
    expect([...back.query.chips].sort()).toEqual(["gov", "liquid", "monthly"]);
  });

  it("leaves the defaults out, and ignores what it does not know", () => {
    const params = new URLSearchParams();
    writeListState(params, EMPTY_QUERY, "yield");
    expect(params.toString()).toBe("");
    const read = readListState(new URLSearchParams("f=gov,nonsense,gov&f=put&by=2020-01&sort=price"), VALUATION_DATE);
    expect(read.query.chips).toEqual(["gov", "put"]);
    expect(read.query.by).toBeNull();
    expect(read.sort).toBe("yield");
    expect(CHIP_IDS).toHaveLength(new Set(CHIP_IDS).size);
  });
});
