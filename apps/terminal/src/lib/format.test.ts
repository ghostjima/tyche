import { describe, expect, it } from "vitest";
import { formats } from "./format";

describe("formats", () => {
  const en = formats("en-US");
  const ru = formats("ru-RU");

  it("writes roubles with the sign in every language, on one line", () => {
    expect(en.money(1234.5)).toBe("₽1,234.50");
    // Stoa's formatters keep a value on one line: the spaces are non-breaking.
    expect(ru.money(1234.5)).toBe("1 234,50 ₽");
    expect(ru.money(1234.5, { fractionDigits: 0 })).toBe("1 235 ₽");
  });

  it("signs income and costs with a plus and the minus sign (U+2212), and leaves zero unsigned", () => {
    expect(en.money(10, { signed: true })).toBe("+₽10.00");
    expect(en.money(-10, { signed: true })).toBe("−₽10.00");
    expect(en.money(0, { signed: true })).toBe("₽0.00");
    expect(ru.money(-10, { signed: true })).toBe("−10,00 ₽");
    // A cost written without a sign request still takes the minus sign.
    expect(en.money(-10)).toBe("−₽10.00");
  });

  it("writes dates from the valuation date, in UTC, on one line", () => {
    expect(en.day(0)).toBe("Oct\u00a05,\u00a02026");
    expect(en.day(365)).toBe("Oct\u00a05,\u00a02027");
    expect(en.month("2026-08")).toBe("August 2026");
    expect(ru.month("2026-08")).toBe("август 2026 г.");
    expect(en.monthName(1)).toBe("January");
    expect(ru.monthName(1)).toBe("январь");
  });

  it("writes terms in years and months with the locale's plurals", () => {
    expect(en.term(10)).toBe("10 days");
    expect(en.term(365)).toBe("1 year");
    expect(en.term(365 * 2 + 152)).toBe("2 years, 5 months");
    expect(ru.term(365 * 2 + 152)).toBe("2 года 5 месяцев");
    expect(en.term(61)).toBe("2 months");
  });

  it("writes percents from fractions, a negative with the minus sign", () => {
    expect(en.percent(0.15342)).toBe("15.34%");
    expect(en.signedPercent(-0.01, 1)).toBe("−1.0%");
    expect(en.signed(-1.5, 1)).toBe("−1.5");
    expect(en.signed(1.5, 1)).toBe("+1.5");
  });
});
