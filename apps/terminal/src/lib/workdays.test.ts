import { describe, expect, it } from "vitest";
import { VALUATION_DATE } from "../data/market";
import { isWorkingDay, workingDaysUntil } from "./workdays";

describe("working days from the valuation date", () => {
  it("are Monday to Friday", () => {
    // The snapshot's valuation date and the six days after it.
    const weekday = new Date(`${VALUATION_DATE}T00:00:00Z`).getUTCDay();
    for (let d = 0; d < 7; d++) {
      const w = (weekday + d) % 7;
      expect(isWorkingDay(d), `day ${d}`).toBe(w !== 0 && w !== 6);
    }
  });

  it("count the working days after today up to a deadline, and back once it has passed", () => {
    expect(workingDaysUntil(0)).toBe(0);
    // Fourteen days ahead hold ten working days, whatever today is.
    expect(workingDaysUntil(14)).toBe(10);
    expect(workingDaysUntil(-14)).toBe(-10);
    let n = 0;
    for (let d = 1; d <= 30; d++) if (isWorkingDay(d)) n += 1;
    expect(workingDaysUntil(30)).toBe(n);
  });
});
