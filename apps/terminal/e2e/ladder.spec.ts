// The ladder builder: opened from the list, a rung a year proposed from
// the issues the filters leave, each rung changeable, the figures after
// the fee and the rungs' tax worked out together, from the engine, with
// every assumption stated, all of it in the URL. In English and in
// Russian, at 1280 and 375 px.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, ready } from "./helpers";

const panel = (page: Page) => page.getByRole("region", { name: /^(Ladder|Лесенка облигаций)$/ });
const params = (page: Page) => new URL(page.url()).searchParams;
const rungs = (page: Page) => panel(page).getByTestId("rung");

test("the ladder opens from the list with its first field focused, a rung a year, and closes back to its button", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Build a ladder" }).click();
  await expect(panel(page).getByLabel("Horizon, years")).toBeFocused();
  expect([params(page).get("lh"), params(page).get("la")]).toEqual(["3", "1000000"]);
  await expect(rungs(page)).toHaveCount(3);
  await expect(rungs(page).first().getByRole("heading", { level: 4 })).toHaveText("Year 1: an exit after Oct 5, 2026, by Oct 5, 2027");
  // Every rung has an issue, its exit in the rung's year, and its figures.
  for (const k of [0, 1, 2]) {
    const rung = rungs(page).nth(k);
    await expect(rung.getByRole("term")).toHaveText(["Issue", "Exit", "Yield to the exit", "Bonds", "Paid, with the accrued interest", "Back at the exit, after the fee, before tax", "Yield after the fee, before tax, nothing reinvested"]);
  }
  const summary = panel(page).getByTestId("ladder-summary");
  await expect(summary.getByRole("term")).toHaveText(["Invested", "Tax, the rungs together", "Back by the last exit, after tax and the fee", "Ladder's yield after tax and the fee", "Rungs with an issue"]);
  await expect(summary.getByRole("definition").last()).toHaveText("3 / 3");
  await expect(summary.getByRole("table", { name: "Payments by year, before tax" }).locator("tbody tr")).toHaveCount(4);
  // The tax of the rungs together, year by year, each step with its rule.
  const working = panel(page).getByTestId("ladder-tax");
  await working.locator("summary").click();
  const first = working.getByRole("table").first();
  await expect(first).toHaveAccessibleName(/^Tax for \d{4}, the rungs together$/);
  await expect(first.getByRole("row", { name: /^Coupons of every rung/ })).toContainText("Tax Code of the Russian Federation, article 214.1, paragraph 7");
  await expect(first.getByRole("row", { name: /^Taxed at 13%/ })).toContainText("article 224, paragraph 1.1");
  await expect(first).toContainText(/Oct\s1,\s2026/);
  // Every assumption is stated.
  await expect(panel(page).locator(".ladder__assumptions li")).toHaveCount(8);
  await expect(panel(page)).toContainText("Tax is worked out for the rungs together");
  await expect(panel(page)).toContainText("a year's net loss carried to later years, which takes a tax declaration (Tax Code of the Russian Federation, article 214.1, paragraph 16, and Tax Code of the Russian Federation, article 220.1)");
  await expect(panel(page)).toContainText("Not investment advice.");
  // Its source is the synthetic universe.
  await expect(panel(page).locator("[data-source]").locator(".stoa-tag")).toHaveText("SIM");
  await panel(page).getByRole("button", { name: "Close the ladder" }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(params(page).has("lh")).toBe(false);
  await expect(page.getByRole("button", { name: "Build a ladder" })).toBeFocused();
});

test("a rung can take another issue or none, the horizon and the amount change, and the link keeps it all", async ({ page }) => {
  await page.goto("/?lang=en&lh=2&la=500000");
  await ready(page);
  const first = rungs(page).first();
  const select = first.locator(".stoa-select__button");
  const proposed = (await select.innerText()).split(" · ")[0]!.trim();
  await select.click();
  const options = page.getByRole("listbox", { name: "Issue", exact: true }).getByRole("option");
  // The second highest yield, then none.
  const second = (await options.nth(1).innerText()).split(" · ")[0]!.trim();
  expect(second).not.toBe(proposed);
  await options.nth(1).click();
  await expect.poll(() => params(page).getAll("lr")).toEqual([second, expect.any(String)]);
  await expect(first.getByRole("definition").first()).toContainText(second);
  await first.locator(".stoa-select__button").click();
  await page.getByRole("listbox", { name: "Issue", exact: true }).getByRole("option", { name: "No issue" }).click();
  await expect(first.getByRole("term")).toHaveCount(0);
  await expect(panel(page).getByTestId("ladder-summary").getByRole("definition").last()).toHaveText("1 / 2");
  expect(params(page).getAll("lr")[0]).toBe("-");
  // The link brings the same ladder back.
  await page.reload();
  await ready(page);
  await expect(panel(page).getByTestId("ladder-summary").getByRole("definition").last()).toHaveText("1 / 2");
  // A longer horizon adds rungs; the amount is kept.
  const years = panel(page).getByLabel("Horizon, years");
  await years.fill("5");
  await years.press("Enter");
  await expect(rungs(page)).toHaveCount(5);
  expect([params(page).get("lh"), params(page).get("la")]).toEqual(["5", "500000"]);
});

test("the proposals follow the filters: with ratings from AA- up, every rung's issue is rated that high", async ({ page }) => {
  await page.goto("/?lang=en&f=ratingHigh&lh=3&la=1000000");
  await ready(page);
  const ratings = await rungs(page).locator(".stoa-select__button").allInnerTexts();
  expect(ratings).toHaveLength(3);
  for (const text of ratings) expect(text.split(" · ")[2]!.trim()).toMatch(/^(AAA|AA\+|AA|AA-)$/);
});

test("по-русски: лесенка, допущения и выплаты по годам", async ({ page }) => {
  await page.goto("/?lang=ru&lh=3&la=1000000");
  await ready(page);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("Лесенка облигаций");
  await expect(rungs(page).first().getByRole("heading", { level: 4 })).toHaveText("Год 1: выход после 5 окт. 2026 г., до 5 окт. 2027 г.");
  await expect(panel(page)).toContainText("Доходность лесенки после налога и комиссии");
  await expect(panel(page)).toContainText("Налог считается для всех ступеней вместе");
  await panel(page).getByTestId("ladder-tax").locator("summary").click();
  await expect(panel(page).getByTestId("ladder-tax")).toContainText("Налоговый кодекс Российской Федерации, статья 214.1, пункт 7");
  await expect(panel(page).getByRole("table", { name: "Выплаты по годам, до налога" })).toBeVisible();
});

test("on a phone the ladder fits without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=ru&lh=10&la=1000000");
  await ready(page);
  await expect(rungs(page)).toHaveCount(10);
  await expectNoHorizontalScroll(page, "ladder at 375");
});
