import { describe, expect, it } from "vitest";
import { HOLDINGS_MAX, readHoldings, setHolding, validBonds, writeHoldings } from "./holdings";

describe("holdings in the URL", () => {
  it("reads ?hold= as a ticker and whole bonds, once per ticker, the last one winning", () => {
    const p = new URLSearchParams("hold=KAMF-01*30&hold=SG-143*5&hold=KAMF-01*40");
    expect(readHoldings(p)).toEqual([
      { id: "SG-143", bonds: 5 },
      { id: "KAMF-01", bonds: 40 },
    ]);
  });

  it("leaves out what is not a ticker and a whole number of bonds", () => {
    const p = new URLSearchParams();
    for (const bad of ["KAMF-01", "*3", "KAMF-01*0", "KAMF-01*1.5", "KAMF-01*-2", "kamf-01*3", "KAMF-01*1e3", "TOOLONGTICKER*3", "KAMF-01*2000000"]) p.append("hold", bad);
    p.append("hold", "SG-143*1");
    expect(readHoldings(p)).toEqual([{ id: "SG-143", bonds: 1 }]);
  });

  it("writes them back as it reads them, and keeps at most the limit", () => {
    const p = new URLSearchParams("q=x&hold=OLD-01*1");
    writeHoldings(p, [
      { id: "KAMF-01", bonds: 30 },
      { id: "SG-143", bonds: 5 },
    ]);
    expect(p.toString()).toBe("q=x&hold=KAMF-01*30&hold=SG-143*5");
    expect(readHoldings(p)).toEqual([
      { id: "KAMF-01", bonds: 30 },
      { id: "SG-143", bonds: 5 },
    ]);
    const many = new URLSearchParams(Array.from({ length: 25 }, (_, i) => ["hold", `X-${i}*1`]));
    expect(readHoldings(many)).toHaveLength(HOLDINGS_MAX);
  });

  it("adds an issue last, sets the bonds of one held, and takes no new issue when full", () => {
    const one = setHolding([], "KAMF-01", 10);
    expect(setHolding(one, "SG-143", 3)).toEqual([
      { id: "KAMF-01", bonds: 10 },
      { id: "SG-143", bonds: 3 },
    ]);
    expect(setHolding(one, "KAMF-01", 20)).toEqual([{ id: "KAMF-01", bonds: 20 }]);
    const full = Array.from({ length: HOLDINGS_MAX }, (_, i) => ({ id: `X-${i}`, bonds: 1 }));
    expect(setHolding(full, "NEW-01", 1)).toEqual(full);
    expect(validBonds(1) && validBonds(1_000_000) && !validBonds(0) && !validBonds(2.5)).toBe(true);
  });
});
