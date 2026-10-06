// What the calculator says about floaters, amortisation, tax and short
// horizons: the figures follow the engine's model, and the screen says
// which rules it applied.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

/** A rouble amount as the English screen writes it ("-₽1,234.56"). */
async function money(cell: Locator): Promise<number> {
  const text = (await cell.innerText()).replace(/[₽,\s]/g, "");
  return Number(text);
}

const row = (page: Page, name: RegExp) => page.getByRole("table", { name: "Where the total comes from" }).getByRole("row", { name });

test("a floater's sale keeps its price when the key rate moves; its coupons change", async ({ page }) => {
  await page.goto(`/?issue=${ISSUES.floater}`);
  await ready(page);
  const shift = page.getByRole("slider", { name: "Key rate change by the horizon" });
  await expect(shift).toHaveAccessibleDescription(/changes the coupons/);
  await shift.focus();
  await page.keyboard.press("End");
  await expect(shift).toHaveAttribute("aria-valuetext", "+3.0 pp");
  const early = page.getByTestId("early-exit");
  await expect(early).toContainText("Total if the key rate changes by +3.0 pp");
  // A fixed coupon's duration would take about a tenth off the total; a
  // floater's total rises with its coupons instead.
  const total = await money(early.locator(".stoa-metric").filter({ hasText: "Total if" }).locator("dd").first());
  const diff = await money(early.locator(".stoa-metric").filter({ hasText: "Difference from the plan" }).locator("dd").first());
  expect(diff).toBeGreaterThan(0);
  expect(diff / total).toBeLessThan(0.03);
  await expect(early).not.toContainText("Modified duration");
  await expect(early).toContainText("A floater's coupon follows the key rate");
  // The scenarios sell at about the same price: the totals differ by about
  // the coupons, a few percent, not a tenth.
  const scenarios = page.getByTestId("floater").getByRole("table").locator("tbody tr");
  const low = await money(scenarios.nth(0).locator("td").first());
  const high = await money(scenarios.nth(2).locator("td").first());
  expect(high / low).toBeLessThan(1.06);
});

test("an amortising issue held to maturity earns about its yield after tax", async ({ page }) => {
  await page.goto(`/?issue=OFZ-46273`);
  await ready(page);
  await page.getByRole("button", { name: "Maturity", exact: true }).click();
  await expect(page.getByRole("switch", { name: /Reinvest payments/ })).toBeChecked();
  const annual = page.getByTestId("result").locator(".stoa-metric").filter({ hasText: "Effective annual return" }).locator("dd").first();
  // Yield to maturity 13.89 percent; 13 percent tax leaves about 12. With
  // the repaid principal idle it showed 6.23.
  expect(Number((await annual.innerText()).replace("%", ""))).toBeGreaterThan(11);
  await expect(row(page, /Income from reinvested payments/)).toBeVisible();
  await expect(page.getByTestId("figures").locator("..")).toContainText("Simple yield over the term");
});

test("tax: a brokerage account at 13 and 15 percent, with the sources of the rules", async ({ page }) => {
  await page.goto(`/?issue=${ISSUES.ofz}`);
  await ready(page);
  const regime = page.getByRole("radiogroup", { name: "Tax regime" });
  await expect(regime.getByRole("radio", { name: "Brokerage account" })).toBeChecked();
  await expect(regime).toHaveAccessibleDescription(/13% up to ₽2,400,000 of a year's investment income, 15% above/);
  await expect(regime).toHaveAccessibleDescription(/Tax Code of the Russian Federation/);
  const tax = row(page, /^Tax/).locator("td").first();
  const at13 = await money(tax);
  const other = page.getByLabel("Other investment income per year, ₽");
  await other.fill("3000000");
  await other.press("Enter");
  await expect.poll(() => money(tax)).not.toBe(at13);
  // Every rouble of this plan is now above the threshold: 15 instead of 13.
  expect((await money(tax)) / at13).toBeCloseTo(15 / 13, 4);

  await regime.getByRole("radio", { name: "IIS type B" }).click();
  await expect(regime).toHaveAccessibleDescription(/opened by Dec 31, 2023/);
  await expect(tax).toHaveText("₽0.00");
  await expect(page.getByLabel("Other investment income per year, ₽")).toHaveCount(0);
});

test("held more than three years, the screen says the gain is exempt", async ({ page }) => {
  await page.goto(`/?issue=${ISSUES.ofz}`);
  await ready(page);
  await page.getByRole("button", { name: "Maturity", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Tax regime" })).toHaveAccessibleDescription(/held more than three years/);
});

test("a horizon under a month gives the return over the period, not a year's rate", async ({ page }) => {
  await page.goto(`/?issue=${ISSUES.ofz}`);
  await ready(page);
  const horizon = page.getByRole("slider", { name: "Holding horizon" });
  await horizon.focus();
  await page.keyboard.press("Home");
  const result = page.getByTestId("result");
  await expect(result.locator(".stoa-metric").filter({ hasText: "Return over the period" })).toBeVisible();
  await expect(result).not.toContainText("Effective annual return");
});
