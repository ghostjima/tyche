import { describe, expect, it } from "vitest";
import { FEE_DEFAULT, feeInRange, readFee, writeFee } from "./fee";

const read = (search: string) => readFee(new URLSearchParams(search));

describe("the broker's fee", () => {
  it("is the engine's usual one, 0.05 percent, when the link names none", () => {
    expect(FEE_DEFAULT).toBe(0.05);
    expect(read("")).toBe(0.05);
  });

  it("reads back what it writes, and leaves the default out of the link", () => {
    for (const fee of [0, 0.01, 0.1, 0.33, 1]) {
      const p = new URLSearchParams("lang=en");
      writeFee(p, fee);
      expect(p.get("fee")).toBe(String(fee));
      expect(readFee(p)).toBe(fee);
    }
    const p = new URLSearchParams("lang=en&fee=0.3");
    writeFee(p, FEE_DEFAULT);
    expect(p.toString()).toBe("lang=en");
  });

  it("keeps a link's fee that is not a number, or out of range, so it can say why", () => {
    expect(read("fee=abc")).toBeNaN();
    expect(read("fee=")).toBeNaN();
    expect(read("fee=-0.1")).toBe(-0.1);
    expect(read("fee=5")).toBe(5);
  });

  it("is computed with from 0 to 1 percent only", () => {
    for (const ok of [0, 0.05, 0.5, 1]) expect(feeInRange(ok)).toBe(true);
    for (const bad of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) expect(feeInRange(bad)).toBe(false);
  });
});
