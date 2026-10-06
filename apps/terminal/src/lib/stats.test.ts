import { describe, expect, it } from "vitest";
import { median, percentile } from "./stats";

describe("stats", () => {
  it("median of odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
  it("nearest-rank percentile", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile([5, 1, 9], 95)).toBe(9);
    expect(percentile([7], 50)).toBe(7);
  });
});
