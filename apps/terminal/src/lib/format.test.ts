import { describe, expect, it } from "vitest";
import { formats } from "./format";

describe("formats", () => {
  const en = formats("en-US");
  const ru = formats("ru-RU");
  const ar = formats("ar-u-nu-arab");

  it("writes roubles with the sign in every language", () => {
    expect(en.money(1234.5)).toBe("₽1,234.50");
    expect(ru.money(1234.5).replace(/\s/g, " ")).toBe("1 234,50 ₽");
    expect(ar.money(1234.5)).toContain("₽");
    expect(ar.money(1234.5)).toMatch(/[٠-٩]/);
  });

  it("signs income and costs, and leaves zero unsigned", () => {
    expect(en.moneySigned(10)).toBe("+₽10.00");
    expect(en.moneySigned(-10)).toBe("-₽10.00");
    expect(en.moneySigned(0)).toBe("₽0.00");
  });

  it("writes dates from the valuation date", () => {
    expect(en.date(0)).toBe("Oct 5, 2026");
    expect(en.date(365)).toBe("Oct 5, 2027");
  });

  it("writes terms in years and months with the locale's plurals", () => {
    expect(en.term(10)).toBe("10 days");
    expect(en.term(365)).toBe("1 year");
    expect(en.term(365 * 2 + 152)).toBe("2 years, 5 months");
    expect(ru.term(365 * 2 + 152)).toBe("2 года 5 месяцев");
    expect(en.term(61)).toBe("2 months");
  });

  it("writes percents from fractions", () => {
    expect(en.percent(0.15342)).toBe("15.34%");
    expect(en.percentSigned(-0.01, 1)).toBe("-1.0%");
  });
});
