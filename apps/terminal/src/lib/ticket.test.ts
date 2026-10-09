import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMISSION_PCT } from "@tyche/yield-twin";
import { parseDepth, pctToUnits } from "../data/depth";
import { parseGates } from "../data/gates";
import { MARKET } from "../data/market";
import { BONDS, accessJson, depthJson } from "../data/universe.testing";
import { twinEngine } from "../engine/twin";
import { ERROR_CODES } from "../engine/types";
import { BONDS_MAX } from "./holdings";
import { ORDERS_KEY, deleteOrder, findOrder, loadOrders, recordOrder, resetOrdersForTests } from "./orders";
import { defaultLots, fieldOf, gateVerdict, maxLots, shownAmounts, stepsAround, ticketOrder } from "./ticket";

const bond = (id: string) => BONDS.find((b) => b.id === id)!;
const indexOf = (id: string) => BONDS.findIndex((b) => b.id === id);

describe("the order ticket's rules", () => {
  it("says each engine error under the field it belongs to", () => {
    expect(fieldOf("invalid_quantity")).toBe("lots");
    for (const code of ["invalid_limit", "invalid_tick", "price_off_tick"] as const) expect(fieldOf(code)).toBe("limit");
    expect(fieldOf("invalid_fee")).toBe("fee");
    // Every other code is about the issue as a whole.
    for (const code of ERROR_CODES.filter((c) => !["invalid_quantity", "invalid_limit", "invalid_tick", "price_off_tick", "invalid_fee"].includes(c))) expect(fieldOf(code)).toBe("issue");
  });

  it("finds the prices on the step around a price off it, in the book's units", () => {
    expect(stepsAround(102.125, 0.01)).toEqual([102.12, 102.13]);
    expect(stepsAround(97.1594, 0.001)).toEqual([97.159, 97.16]);
    expect(stepsAround(102.12, 0.01)).toEqual([102.12, 102.12]);
    expect(stepsAround(100.2527, 0.0001)).toEqual([100.2527, 100.2527]);
  });

  it("starts at ten bonds' worth, or one lot, and takes up to the holdings' limit", () => {
    expect([defaultLots(1), defaultLots(100), defaultLots(1000)]).toEqual([10, 1, 1]);
    expect(maxLots(1)).toBe(BONDS_MAX);
    expect(maxLots(1000) * 1000).toBeLessThanOrEqual(BONDS_MAX);
  });

  it("holds a purchase the investor's status does not allow, and never a sale", () => {
    expect(gateVerdict("open", "unqualified", "buy")).toEqual({ allowed: true, why: "open" });
    expect(gateVerdict("test", "unqualified", "buy")).toEqual({ allowed: false, why: "needs_test" });
    expect(gateVerdict("test", "tested", "buy")).toEqual({ allowed: true, why: "tested" });
    expect(gateVerdict("test", "qualified", "buy")).toEqual({ allowed: true, why: "qualified" });
    expect(gateVerdict("qualified", "unqualified", "buy")).toEqual({ allowed: false, why: "qualified_only" });
    expect(gateVerdict("qualified", "tested", "buy")).toEqual({ allowed: false, why: "qualified_only" });
    expect(gateVerdict("qualified", "qualified", "buy")).toEqual({ allowed: true, why: "qualified" });
    for (const access of ["open", "test", "qualified"] as const) expect(gateVerdict(access, "unqualified", "sell")).toEqual({ allowed: true, why: "sell" });
  });

  it("gives the engine an order whose limit price is on the step as the book counts it", () => {
    const b = bond("KAMF-01");
    const order = ticketOrder({ side: "buy", limit: "yield", limitValue: b.targetYield * 100, lots: 3, lotSize: b.lot, tickPct: b.tickPct, feePct: COMMISSION_PCT });
    const r = twinEngine.order_ticket(b.issue, MARKET, order);
    if (!("ok" in r)) throw new Error(r.error);
    // A whole number of steps in book units.
    expect(pctToUnits(r.ok.cleanPct) % pctToUnits(b.tickPct)).toBe(0);
    expect(r.ok.bonds).toBe(3);
    expect(r.ok.total).toBeCloseTo(r.ok.amount + r.ok.fee, 6);
  });
});

describe("the amounts the ticket shows", () => {
  it("add up to the kopeck, and stay within a kopeck of the engine's", () => {
    for (const b of BONDS) {
      for (const side of ["buy", "sell"] as const) {
        const r = twinEngine.order_ticket(b.issue, MARKET, ticketOrder({ side, limit: "price", limitValue: b.issue.pricePct, lots: 7, lotSize: b.lot, tickPct: b.tickPct, feePct: 0.07 }));
        if (!("ok" in r)) throw new Error(`${b.id}: ${r.error}`);
        const s = shownAmounts(r.ok, side);
        const cents = (x: number) => Math.round(x * 100);
        expect(cents(s.amount), b.id).toBe(cents(s.clean) + cents(s.accrued));
        expect(cents(s.total), b.id).toBe(cents(s.amount) + (side === "buy" ? 1 : -1) * cents(s.fee));
        expect(Math.abs(s.total - r.ok.total), b.id).toBeLessThanOrEqual(0.0201);
      }
    }
  });
});

describe("the gate as tyche-market writes it", () => {
  it("names each issue's access and reasons, and the rating threshold", () => {
    const gates = parseGates(accessJson());
    expect(gates.byTicker.size).toBe(BONDS.length);
    for (const b of BONDS) {
      const g = gates.byTicker.get(b.id)!;
      expect(g.reasons.length, b.id).toBeGreaterThan(0);
      // An issue its terms restrict to qualified investors is for them only;
      // a fixed-coupon government bond is open to everyone, an index-linked
      // one needs the test.
      if (b.qualifiedOnly) expect(g, b.id).toMatchObject({ access: "qualified" });
      if (b.issuer.kind === "government") {
        expect(g, b.id).toEqual(b.coupon.kind === "fixed" ? { access: "open", reasons: ["government"] } : { access: "test", reasons: ["index_government"] });
      }
    }
    expect([gates.testBelow, gates.indexBelow]).toEqual(["A+", "AA-"]);
    expect(new Set([...gates.byTicker.values()].map((g) => g.access))).toEqual(new Set(["open", "test", "qualified"]));
  });

  it("refuses an access or a reason it has no words for", () => {
    expect(() => parseGates(JSON.stringify({ testBelow: "BBB-", indexBelow: "AA-", issues: [{ ticker: "X", access: "open", reasons: ["whim"] }] }))).toThrow(/unknown reason/);
    expect(() => parseGates(JSON.stringify({ testBelow: "BBB-", indexBelow: "AA-", issues: [{ ticker: "X", access: "maybe", reasons: [] }] }))).toThrow(/unknown access/);
    expect(() => parseGates(JSON.stringify({ testBelow: "Z", indexBelow: "AA-", issues: [] }))).toThrow(/unknown rating/);
    expect(() => parseGates(JSON.stringify({ testBelow: "A+", indexBelow: "Z", issues: [] }))).toThrow(/unknown rating/);
  });
});

describe("a depth check against the synthetic book", () => {
  it("fills a buy from the best offer up to its limit, and says what is left", () => {
    const i = indexOf("KAMF-01");
    const quote = parseDepth(depthJson(i, "buy", 0, 0));
    expect(quote.filled).toBe(0);
    const best = quote.bestPct!;
    expect(best).toBeGreaterThan(0);
    // All of a small order at the best offer: one level, no slippage.
    const small = parseDepth(depthJson(i, "buy", 10, pctToUnits(best)));
    expect(small).toMatchObject({ requested: 10, filled: 10, left: 0, levelsUsed: 1, slippageBp: 0, averagePct: best });
    // A large one two steps up takes more levels, at a worse average, and
    // the rest would rest in the book.
    const large = parseDepth(depthJson(i, "buy", 100_000, pctToUnits(best + 0.02)));
    expect(large.levelsUsed).toBe(2);
    expect(large.left).toBe(100_000 - large.filled);
    expect(large.left).toBeGreaterThan(0);
    expect(large.averagePct!).toBeGreaterThan(best);
    expect(large.slippageBp!).toBeGreaterThan(0);
    expect(large.fills.reduce((s, x) => s + x.bonds, 0)).toBe(large.filled);
    // Below the best offer nothing fills.
    expect(parseDepth(depthJson(i, "buy", 10, pctToUnits(best - 0.01)))).toMatchObject({ filled: 0, averagePct: null, slippageBp: null });
  });

  it("refuses an issue or a side the market does not have", () => {
    expect(() => parseDepth(depthJson(BONDS.length, "buy", 1, 1))).toThrow();
    expect(() => parseDepth(depthJson(0, "hold", 1, 1))).toThrow();
  });
});

/** A storage that holds strings, or throws on every call when blocked. */
function storage(blocked = false) {
  const data = new Map<string, string>();
  const check = () => {
    if (blocked) throw new Error("blocked");
  };
  return {
    getItem: (k: string) => (check(), data.get(k) ?? null),
    setItem: (k: string, v: string) => (check(), void data.set(k, v)),
    data,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetOrdersForTests();
});

describe("demo orders, recorded in this browser only", () => {
  const order = { id: "KAMF-01", side: "buy" as const, lots: 10, bonds: 10, pricePct: 102.08, total: 10_250.5 };

  it("keep the last one per issue in storage, and delete it", () => {
    const s = storage();
    vi.stubGlobal("localStorage", s);
    recordOrder(order);
    const all = recordOrder({ ...order, side: "sell", total: 10_100 });
    expect(all).toHaveLength(1);
    expect(findOrder(all, "KAMF-01")?.side).toBe("sell");
    expect(JSON.parse(s.data.get(ORDERS_KEY)!)).toHaveLength(1);
    expect(deleteOrder("KAMF-01")).toEqual([]);
  });

  it("drop what is not a demo order, and last as long as the page when storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify([order, { id: "X", side: "hold" }, { ...order, id: "Y", bonds: 0 }]), setItem: () => {} });
    expect(loadOrders().map((o) => o.id)).toEqual(["KAMF-01"]);
    resetOrdersForTests();
    vi.stubGlobal("localStorage", storage(true));
    expect(loadOrders()).toEqual([]);
    expect(recordOrder(order)).toHaveLength(1);
    expect(loadOrders()).toHaveLength(1);
  });
});
