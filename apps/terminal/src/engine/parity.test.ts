// The two engines behind the app's own adapters, on every generated issue
// with the calculator's default plan and its corners: the same figures,
// within the engine's parity tolerance, and the same error codes. The
// WebAssembly module is instantiated from the linked package's file.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BONDS } from "../data/universe.testing";
import { CURVE, MARKET } from "../data/market";
import { twinEngine } from "./twin";
import { loadWasm } from "./wasm";
import type { Plan, TaxRegime } from "./types";

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("tyche-yield/package.json"));

function close(a: unknown, b: unknown, path: string): void {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return;
    const tol = 1e-6 * Math.max(Math.abs(a), Math.abs(b));
    expect(Math.abs(a - b) <= tol, `${path}: ${a} vs ${b}`).toBe(true);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    expect(a.length, path).toBe(b.length);
    a.forEach((x, i) => close(x, b[i], `${path}[${i}]`));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) close((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  expect(a, path).toEqual(b);
}

describe("WebAssembly and twin through the app's adapters", () => {
  let wasm: Awaited<ReturnType<typeof loadWasm>>["engine"];
  beforeAll(async () => {
    wasm = (await loadWasm({ module_or_path: readFileSync(join(pkg, "tyche_yield_bg.wasm")) })).engine;
  });

  it("derive the same figures for every issue", () => {
    for (const b of BONDS) close(wasm.derive_bond(b.issue, MARKET), twinEngine.derive_bond(b.issue, MARKET), b.id);
  });

  it("calculate the same plans, and the same errors, for every issue", () => {
    const regimes: TaxRegime[] = ["standard", "iis_b"];
    for (const b of BONDS) {
      const d = twinEngine.derive_bond(b.issue, MARKET);
      if (!("ok" in d)) throw new Error(b.id);
      const maturity = d.ok.maturityDay;
      const plans: Plan[] = [
        { amount: 100_000, horizonDay: Math.min(365, maturity), reinvest: true, taxRegime: "standard", otherIncome: 0, rateShiftPct: 2 },
        { amount: 1_000_000, horizonDay: maturity, reinvest: false, taxRegime: regimes[b.id.length % 2]!, otherIncome: 2_000_000, rateShiftPct: -1.5 },
        { amount: 50_000, horizonDay: Math.min(10, maturity), reinvest: true, taxRegime: "standard", otherIncome: 0, rateShiftPct: 1 },
        { amount: 0, horizonDay: 10, reinvest: true, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 },
        { amount: 500, horizonDay: 10, reinvest: true, taxRegime: "iis_b", otherIncome: 0, rateShiftPct: 0 },
        { amount: 2e9, horizonDay: 10, reinvest: true, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 },
        { amount: 100_000, horizonDay: Math.min(365, maturity), reinvest: true, taxRegime: "standard", otherIncome: -1, rateShiftPct: 0 },
      ];
      for (const [n, plan] of plans.entries()) close(wasm.calculate(b.issue, MARKET, plan), twinEngine.calculate(b.issue, MARKET, plan), `${b.id} plan ${n}`);
    }
  });

  it("explain the same working for every issue, plan and fee", () => {
    for (const b of BONDS) {
      const d = twinEngine.derive_bond(b.issue, MARKET);
      if (!("ok" in d)) throw new Error(b.id);
      const maturity = d.ok.maturityDay;
      const plans: [Plan, number][] = [
        [{ amount: 100_000, horizonDay: Math.min(200, maturity), reinvest: true, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 }, 0.05],
        [{ amount: 1_000_000, horizonDay: maturity, reinvest: false, taxRegime: "standard", otherIncome: 2_390_000, rateShiftPct: 0 }, 0.3],
        [{ amount: 100_000, horizonDay: maturity, reinvest: false, taxRegime: "iis_b", otherIncome: 0, rateShiftPct: 0 }, 0],
        [{ amount: 100_000, horizonDay: maturity, reinvest: false, taxRegime: "standard", otherIncome: 0, rateShiftPct: 0 }, -1],
      ];
      for (const [n, [plan, fee]] of plans.entries()) close(wasm.explain(b.issue, MARKET, plan, fee, CURVE), twinEngine.explain(b.issue, MARKET, plan, fee, CURVE), `${b.id} explain ${n}`);
    }
  });

  it("take the same G-spreads for every issue, and refuse the same curves", () => {
    const curves = [CURVE, { termsYears: [], yieldsPct: [] }, { termsYears: [1, 2], yieldsPct: [10] }, { termsYears: [1, 2], yieldsPct: [10, Number.NaN] }];
    for (const b of BONDS) {
      for (const [n, curve] of curves.entries()) close(wasm.g_spread(b.issue, MARKET, curve), twinEngine.g_spread(b.issue, MARKET, curve), `${b.id} g_spread ${n}`);
    }
  });

  it("price the same flows the same", () => {
    const amounts = [70, 70, 1070];
    const days = [100, 282, 464];
    for (const y of [0.05, 0.15, 0.35]) {
      close(wasm.price_from_yield(amounts, days, y), twinEngine.price_from_yield(amounts, days, y), `y=${y}`);
    }
  });
});
