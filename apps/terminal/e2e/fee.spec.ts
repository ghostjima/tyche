// The broker's fee: one field in the issue card's yield block, one value
// for the session that the card, the calculator and the comparison follow,
// kept in the URL so a shared link reproduces the figures; a fee out of
// range, or one the engine refuses, is said in words.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ISSUES, expectNoHorizontalScroll, ready } from "./helpers";

const params = (page: Page) => new URL(page.url()).searchParams;
const text = async (l: Locator) => (await l.textContent()) ?? "";
const field = (page: Page) => page.getByTestId("fee");
const yieldTable = (page: Page) => page.getByRole("table", { name: "Yield to maturity and to the offer" });
const afterFee = (page: Page) => yieldTable(page).getByRole("row", { name: /^After a / });
const afterTax = (page: Page) => yieldTable(page).getByRole("row", { name: /^After tax and the fee/ });
const commission = (page: Page) => page.locator(".calculator").getByRole("row", { name: /^Broker's commission/ });

async function setFee(page: Page, value: string) {
  const input = field(page).getByLabel("Broker's fee, % of each trade");
  await input.fill(value);
  await input.press("Enter");
}

test("the fee is labelled, says what it is charged on, and starts at the usual 0.05 percent", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  const input = field(page).getByLabel("Broker's fee, % of each trade");
  await expect(input).toHaveValue("0.05");
  await expect(input).toHaveAccessibleDescription(/^Charged on the purchase and on a sale before maturity, not at redemption\..*From 0\.00% to 1\.00%; 0\.05% unless you change it\.$/);
  await expect(afterFee(page)).toHaveAccessibleName(/^After a 0\.05% fee/);
  await expect(commission(page)).toHaveAccessibleName(/^Broker's commission, 0\.05% of each trade/);
  await expect(page.getByTestId("calc-fee")).toHaveText("Broker's fee: 0.05% of each trade, as set with the issue's yield.");
  expect(params(page).has("fee")).toBe(false);
});

test("one fee for the card, the calculator and the comparison, kept in the URL so a link reproduces the figures", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}&cmp=${ISSUES.offer}`);
  await ready(page);
  const before = { fee: await text(afterFee(page)), tax: await text(afterTax(page)), total: await text(commission(page)) };
  const compared = page.getByRole("region", { name: "Comparison" }).getByRole("row", { name: /^After tax and the fee/ });
  const comparedBefore = await text(compared);
  await setFee(page, "0.3");
  await expect.poll(() => params(page).get("fee")).toBe("0.3");
  // The card's yields after the fee and after tax, the working, the
  // calculator and the comparison all follow it.
  await expect(afterFee(page)).toHaveAccessibleName(/^After a 0\.30% fee/);
  await expect(afterFee(page)).not.toHaveText(before.fee);
  await expect(afterTax(page)).not.toHaveText(before.tax);
  await expect(commission(page)).toHaveAccessibleName(/^Broker's commission, 0\.30% of each trade/);
  await expect(commission(page)).not.toHaveText(before.total);
  await expect(page.getByTestId("calc-fee")).toHaveText("Broker's fee: 0.30% of each trade, as set with the issue's yield.");
  await expect(compared).not.toHaveText(comparedBefore);
  await page.getByTestId("working").locator("summary").click();
  await expect(page.getByRole("table", { name: "Yield, held to maturity" }).getByRole("row", { name: /^Price with the fee/ })).toContainText("× (1 + 0.30%)");
  const after = { fee: await text(afterFee(page)), tax: await text(afterTax(page)), total: await text(commission(page)), compared: await text(compared) };
  // The same link, opened afresh, gives the same figures.
  await page.goto(page.url());
  await ready(page);
  await expect(field(page).getByLabel("Broker's fee, % of each trade")).toHaveValue("0.3");
  await expect(afterFee(page)).toHaveText(after.fee);
  await expect(afterTax(page)).toHaveText(after.tax);
  await expect(commission(page)).toHaveText(after.total);
  await expect(compared).toHaveText(after.compared);
  // Another issue's link with the same fee shows it too.
  await page.goto(`/?lang=en&issue=${ISSUES.gov}&fee=0.3`);
  await ready(page);
  await expect(page.getByRole("table", { name: "Yield to maturity and to the offer" }).getByRole("row", { name: /^After a 0\.30% fee/ })).toBeVisible();
});

test("the arrow keys step the fee by a hundredth of a percent, and the focus stays in the field", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  const input = field(page).getByLabel("Broker's fee, % of each trade");
  await input.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(input).toHaveValue("0.07");
  await expect.poll(() => params(page).get("fee")).toBe("0.07");
  await expect(afterFee(page)).toHaveAccessibleName(/^After a 0\.07% fee/);
  await page.keyboard.press("ArrowDown");
  await expect(input).toHaveValue("0.06");
  await expect(input).toBeFocused();
});

test("a fee out of range is said in words and announced, the figures after it are not shown, and one press brings the usual fee back", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  await setFee(page, "2");
  const alert = field(page).getByRole("alert");
  await expect(alert).toHaveText("Enter a fee from 0.00% to 1.00%.");
  await expect(field(page).getByLabel("Broker's fee, % of each trade")).toHaveAccessibleDescription(/Enter a fee from 0\.00% to 1\.00%\.$/);
  await expect(page.getByTestId("yield-error")).toHaveText("The broker's fee is not from 0.00% to 1.00%, so the figures after it are not worked out.");
  await expect(yieldTable(page)).toHaveCount(0);
  const error = page.locator(".calculator").getByTestId("calc-error");
  await expect(error).toContainText("The broker's fee is not from 0.00% to 1.00%");
  await error.getByRole("button", { name: "Use the usual fee, 0.05%" }).click();
  await expect(field(page).getByLabel("Broker's fee, % of each trade")).toHaveValue("0.05");
  await expect(alert).toHaveCount(0);
  await expect(afterFee(page)).toHaveAccessibleName(/^After a 0\.05% fee/);
  expect(params(page).has("fee")).toBe(false);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test("a fee the engine refuses, from a link, shows the engine's invalid_fee in words", async ({ page }) => {
  for (const fee of ["-0.1", "abc"]) {
    await page.goto(`/?lang=en&issue=${ISSUES.offer}&fee=${fee}`);
    await ready(page);
    await expect(field(page).getByRole("alert")).toHaveText("Enter a fee from 0.00% to 1.00%.");
    await expect(page.getByTestId("yield-error")).toHaveText("The broker's fee must be a number of at least zero.");
    await expect(page.locator(".calculator").getByTestId("calc-error")).toContainText("The broker's fee must be a number of at least zero.");
  }
});

test("по-русски: комиссия брокера с запятой, описанием и ошибкой словами", async ({ page }) => {
  await page.goto(`/?lang=ru&issue=${ISSUES.offer}`);
  await ready(page);
  const input = field(page).getByLabel("Комиссия брокера, % от сделки");
  await expect(input).toHaveValue("0,05");
  await expect(input).toHaveAccessibleDescription(/^Берётся при покупке и при продаже до погашения, при погашении не берётся\./);
  await input.fill("0,1");
  await input.press("Enter");
  await expect.poll(() => params(page).get("fee")).toBe("0.1");
  await expect(page.getByRole("table", { name: "Доходность к погашению и к оферте" }).getByRole("row", { name: /^После комиссии 0,10\s%/ })).toBeVisible();
  await input.fill("1,5");
  await input.press("Enter");
  await expect(field(page).getByRole("alert")).toHaveText("Введите комиссию от 0,00 % до 1,00 %.");
});

test("on a phone the fee field and its message fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?lang=ru&issue=${ISSUES.offer}&fee=2`);
  await ready(page);
  await expect(field(page).getByRole("alert")).toBeVisible();
  await expectNoHorizontalScroll(page, "fee out of range at 375");
});
