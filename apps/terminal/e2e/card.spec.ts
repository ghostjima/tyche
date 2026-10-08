// The issue card where the decision is made: the risks (the offer with
// its countdown, amortisation, subordination, a floater's coupon resets,
// the rating's outlook, who can buy, liquidity with its thresholds), the
// yield to maturity and to the offer before and after the fee and after
// tax with nothing reinvested, and how each figure is worked out, citing
// its rule. In English and in Russian.
import { expect, test, type Page } from "@playwright/test";
import { ISSUES, PORTFOLIO_PUT, expectNoHorizontalScroll, ready } from "./helpers";

/** Subordinated, qualified only, a put offer, a negative outlook and a
 * thin market. */
const RISKY = "BELB-02";
/** An issuer's call. */
const CALL = "OKAC-01";

const risk = (page: Page, term: string) => page.getByTestId("risks").locator(".stoa-description-list__item").filter({ has: page.getByRole("term").filter({ hasText: term }) });

test("the risks sit in the card: offer and countdown, amortisation, subordination, outlook, access, liquidity", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${RISKY}`);
  await ready(page);
  const risks = page.getByTestId("risks");
  await expect(risks.getByRole("heading", { level: 3 })).toHaveText("Risks");
  await expect(risk(page, "Offer")).toContainText(/Put offer on Nov\s30,\s2029: the holder may sell the bond back/);
  // The time left before the offer, from the valuation date.
  await expect(risk(page, "Offer")).toContainText("1,152 days left");
  await expect(risk(page, "Amortisation")).toContainText("None: the face value comes back in full at maturity.");
  await expect(risk(page, "Subordination")).toContainText("Subordinated: in a default it is repaid after the issuer's other debts.");
  await expect(risk(page, "Synthetic rating")).toContainText("BB+, outlook negative; assigned by a fictional agency.");
  await expect(risk(page, "Synthetic rating")).toContainText("Negative outlook");
  await expect(risk(page, "Who can buy")).toContainText("Qualified investors only");
  await expect(risk(page, "Who can buy")).toContainText("Federal Law No. 39-FZ on the securities market, article 3, paragraph 5");
  // The warning names the book's figures and both thresholds.
  const warning = page.getByTestId("liquidity-warning");
  await expect(warning).toContainText("Thin market");
  await expect(warning).toContainText("a spread of 8.55% and holds 7,200 bonds on each side");
  await expect(warning).toContainText("a spread up to 0.50% and at least 10,000 bonds on each side");
});

test("a liquid issue says so with its figures, an issuer's call warns of the coupons it ends, and a plain issue has no offer", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  await expect(page.getByTestId("liquidity-warning")).toHaveCount(0);
  await expect(risk(page, "Liquidity")).toContainText("Liquid: the synthetic order book quotes a spread of 0.08% (up to 0.50% counts as liquid)");
  await expect(risk(page, "Who can buy")).toContainText(
    "Every investor: rated A+ or higher, the Bank of Russia's level, it needs neither qualified status nor a test (Federal Law No. 39-FZ on the securities market, article 3.1, paragraph 2, subparagraph 2).",
  );
  await expect(risk(page, "Who can buy")).toContainText("a synthetic rating is read as such a rating, an assumption of the synthetic universe");
  await page.goto(`/?lang=en&issue=${CALL}`);
  await ready(page);
  await expect(risk(page, "Offer")).toContainText("Issuer's call on");
  await expect(risk(page, "Offer")).toContainText("the coupons after that date would not come");
  await page.goto(`/?lang=en&issue=${ISSUES.gov}`);
  await ready(page);
  await expect(risk(page, "Offer")).toContainText("No offer: the bond runs to maturity.");
  await expect(risk(page, "Who can buy")).toContainText(
    "Every investor: a government bond needs neither qualified status nor a test (Federal Law No. 39-FZ on the securities market, article 3.1, paragraph 2, subparagraph 5).",
  );
});

test("an issue rated below the Bank of Russia's level asks a non-qualified investor for a test, or the yearly allowance without one", async ({ page }) => {
  // Rated BBB- on the synthetic scale: open under a BBB- threshold, a
  // test at the board's A+.
  await page.goto(`/?lang=en&issue=${PORTFOLIO_PUT}`);
  await ready(page);
  await expect(risk(page, "Who can buy")).toContainText("Test required");
  await expect(risk(page, "Who can buy")).toContainText("Rated below A+, the Bank of Russia's level, a non-qualified investor buys it after passing the broker's test");
  await expect(risk(page, "Who can buy")).toContainText("₽300,000 a year");
  await expect(risk(page, "Who can buy")).toContainText("Federal Law No. 39-FZ on the securities market, article 3.1");
  await page.goto(`/?lang=ru&issue=${PORTFOLIO_PUT}`);
  await ready(page);
  await expect(risk(page, "Кто может купить")).toContainText("Нужен тест");
  await expect(risk(page, "Кто может купить")).toContainText("Рейтинг ниже A+, уровня Банка России");
});

test("a floater shows its coupon resets from the Bank of Russia's figures, and an amortising issue its schedule", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.floater}`);
  await ready(page);
  const resets = page.getByRole("table", { name: "The latest coupon resets" });
  await expect(resets.locator("tbody tr")).toHaveCount(6);
  await expect(resets.locator("tbody tr").first()).toContainText("+2.10%");
  await expect(risk(page, "Coupon resets")).toContainText("The coupon is RUONIA on the first day of each period plus the issue's spread.");
  await expect(risk(page, "Who can buy")).toContainText("The coupon follows an index. The synthetic universe gates it as a fixed coupon");
  // The card names the Bank of Russia beside the synthetic data.
  await expect(page.locator(".issue-card > .stoa-source-note, .issue-card .stoa-source-note").filter({ hasText: "Bank of Russia" })).toHaveCount(1);
  const schedule = page.getByRole("table", { name: "Face value repaid per bond" });
  await expect(schedule.locator("tbody tr")).toHaveCount(3);
  await expect(schedule).toContainText("33.33%");
  await expect(risk(page, "Amortisation")).toContainText("2 payments");
});

test("the yield to maturity and to the offer, after the fee and after tax with nothing reinvested, follow the calculator", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  const table = page.getByRole("table", { name: "Yield to maturity and to the offer" });
  await expect(table.getByRole("columnheader")).toHaveText(["Held to", /^Maturity\s*May\s28,\s2028$/, /^The offer\s*Aug\s29,\s2027$/]);
  // The measures down the side: maturity's column first, then the offer's.
  const gross = table.getByRole("row", { name: /^Yield/ });
  const afterFee = table.getByRole("row", { name: /^After a 0\.05% fee/ });
  const afterTax = table.getByRole("row", { name: /^After tax and the fee/ });
  await expect(gross.getByRole("cell")).toHaveText(["15.79%", "14.60%"]);
  await expect(afterFee.getByRole("cell")).toHaveText(["15.75%", "14.53%"]);
  await expect(afterTax.getByRole("cell")).toHaveText(["12.19%", "11.82%"]);
  // The G-spread of each yield, from the engine, to the Bank of Russia's
  // zero-coupon curve.
  await expect(table.getByRole("row", { name: /^G-spread/ }).getByRole("cell")).toHaveText(["+151 bp", "+145 bp"]);
  const maturity = afterTax;
  await expect(page.getByTestId("yield-note")).toContainText("No hidden reinvestment");
  // Other income above the threshold: 15 percent instead of 13, less left.
  await page.getByLabel("Other investment income per year, ₽").fill("3000000");
  await page.getByLabel("Other investment income per year, ₽").press("Enter");
  await expect(maturity).not.toContainText("12.19%");
  await expect(page.getByTestId("yield-note")).toContainText("other investment income of ₽3,000,000 a year");
  // An IIS of type B: no tax.
  await page.getByRole("radio", { name: "IIS type B" }).click();
  await expect(page.getByTestId("yield-note")).toContainText("so no tax is counted");
});

test("how it is worked out: the accrued interest, the yield and the tax per year, each step with its rule", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  const working = page.getByTestId("working");
  await working.locator("summary").click();
  const price = page.getByRole("table", { name: "Price and accrued interest" });
  await expect(price.getByRole("row", { name: /^Accrued interest/ })).toContainText("× 36 / 91");
  await expect(price.getByRole("row", { name: /^Accrued interest/ })).toContainText("₽16.19");
  await expect(price.getByRole("row", { name: /^Dirty price/ })).toContainText("₽1,037.19");
  const yieldTable = page.getByRole("table", { name: "Yield, held to maturity" });
  await expect(yieldTable.getByRole("row", { name: /^Sum: the dirty price/ })).toContainText("₽1,037.19");
  await expect(yieldTable.getByRole("row", { name: /^Yield solved/ })).toContainText("15.79%");
  await expect(yieldTable.getByRole("row", { name: /^Yield after tax and the fee/ })).toContainText("12.19%");
  await expect(yieldTable).toContainText("tyche-yield: annual effective yield, ACT/365");
  const tax = page.getByRole("table", { name: "Tax for 2026, held to maturity" });
  await expect(tax.getByRole("row", { name: /^Accrued interest paid at purchase/ })).toContainText("−₽");
  await expect(tax.getByRole("row", { name: /^Taxed at 13%/ })).toContainText("Tax Code of the Russian Federation, article 224");
  await expect(tax.getByRole("row", { name: /^Coupons/ })).toContainText("article 214.1");
  await expect(tax).toContainText(/Oct\s1,\s2026/);
  await expect(page.getByRole("table", { name: "Tax for 2028, held to maturity" }).getByRole("row", { name: /^Result of the redemptions/ })).toBeVisible();
  // The G-spread: the duration, the curve read between its published terms
  // with the Bank of Russia named and dated, and the difference.
  const spread = page.getByRole("table", { name: "G-spread, held to maturity" });
  await expect(spread.getByRole("row", { name: /^Macaulay duration/ })).toContainText("1.46 years");
  const curve = spread.getByRole("row", { name: /^Curve's yield at the duration, read between the terms of 1\.00 years and 2\.00 years/ });
  await expect(curve).toContainText("13.58% + (1.4562 − 1.00) / (2.00 − 1.00) × (15.13% − 13.58%)");
  await expect(curve).toContainText("14.29%");
  await expect(curve).toContainText("Bank of Russia: zero-coupon yield curve of federal loan bonds");
  await expect(curve).toContainText(/Oct\s5,\s2026/);
  await expect(curve.getByRole("link")).toHaveAttribute("href", "https://www.cbr.ru/hd_base/zcyc_params/");
  await expect(spread.getByRole("row", { name: /^G-spread: the yield less the curve's/ })).toContainText("+151 bp");
  await expect(page.getByRole("table", { name: "G-spread, held to the offer" }).getByRole("row", { name: /^G-spread: the yield less/ })).toContainText("+145 bp");
  // The card names the Bank of Russia and the curve's calculator.
  await expect(page.locator(".issue-card .stoa-source-note").filter({ hasText: "Bank of Russia" }).getByRole("link", { name: "moex.com" })).toBeVisible();
  // Each table copies as plain text.
  await expect(working.getByRole("button", { name: /Copy/ }).first()).toBeVisible();
});

test("an inflation-linked issue's real yield has no G-spread to the nominal curve", async ({ page }) => {
  await page.goto(`/?lang=en&issue=NEVB-01`);
  await ready(page);
  const table = page.getByRole("table", { name: "Yield to maturity and to the offer" });
  await expect(table.getByRole("row", { name: /^G-spread/ }).getByRole("cell")).toHaveText(["not compared: the yield is real"]);
  await page.getByTestId("working").locator("summary").click();
  await expect(page.getByRole("table", { name: "Yield, held to maturity" })).toBeVisible();
  await expect(page.getByRole("table", { name: /^G-spread/ })).toHaveCount(0);
});

test("в карточке по-русски: риски, доходность без скрытого реинвестирования и расчёт со ссылкой на Налоговый кодекс", async ({ page }) => {
  await page.goto(`/?lang=ru&issue=${RISKY}`);
  await ready(page);
  await expect(page.getByTestId("risks").getByRole("heading", { level: 3 })).toHaveText("Риски");
  await expect(risk(page, "Оферта")).toContainText("Пут-оферта");
  await expect(risk(page, "Кто может купить")).toContainText("Федеральный закон № 39-ФЗ «О рынке ценных бумаг», статья 3, пункт 5");
  await expect(page.getByTestId("liquidity-warning")).toContainText("Низкая ликвидность");
  await expect(page.getByTestId("liquidity-warning")).toContainText("со спредом до 0,50 %");
  await expect(page.getByTestId("honest-yield").getByRole("heading", { level: 3 })).toHaveText("Доходность после налога и комиссии");
  await expect(page.getByTestId("yield-note")).toContainText("Без скрытого реинвестирования");
  await page.getByTestId("working").locator("summary").click();
  await expect(page.getByTestId("working")).toContainText("Налоговый кодекс Российской Федерации, статья 224");
  await expect(page.getByRole("table", { name: "G-спред, если держать до погашения" })).toContainText("Банк России: кривая бескупонной доходности ОФЗ");
  // The banner still says it is not advice.
  await expect(page.getByRole("banner")).toContainText("Не является инвестиционной рекомендацией.");
});

test("on a phone the risks and the yield fit the screen without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const id of [RISKY, ISSUES.floater]) {
    await page.goto(`/?lang=ru&issue=${id}`);
    await ready(page);
    await page.getByTestId("working").locator("summary").click();
    await expectNoHorizontalScroll(page, `${id} at 375`);
  }
});
