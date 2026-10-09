// The order ticket: buy or sell, a limit price in percent of face linked
// to its yield through the engine, lots, the accrued interest and the
// total with the broker's fee, the yields at the limit price, a depth
// check against the synthetic book, the qualification gate and a
// confirmation that records a demo order in this browser only.
import { expect, test, type Page } from "@playwright/test";
import { ISSUES, expectNoHorizontalScroll, ready } from "./helpers";

/** KAMF-01's synthetic book at noon on the valuation date: the best offer
 * 102.08 (1,610 bonds), then 102.10 (2,013); the best bid 102.00. */
const ISSUE = ISSUES.offer;

const ticket = (page: Page) => page.getByRole("region", { name: /^(Order ticket|Заявка)$/ });
const price = (page: Page) => ticket(page).getByLabel(/^(Price, % of face|Цена, % от номинала)$/);
const yieldField = (page: Page) => ticket(page).getByLabel(/^Yield to (the offer|maturity), %$/);
/** Says the investor is qualified, so the gate holds no purchase
 * whatever the issue's rule. */
const qualified = (page: Page) => ticket(page).getByTestId("ticket-gate").locator("label").filter({ has: page.locator('input[value="qualified"]') }).click();
const lots = (page: Page) => ticket(page).getByTestId("ticket-lots").getByRole("textbox");
async function typeIn(field: ReturnType<typeof price>, value: string) {
  await field.fill(value);
  await field.press("Enter");
}

test("a buy starts at the best offer, with the yield, the total with the accrued interest and the fee, and the depth", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUE}`);
  await ready(page);
  const t = ticket(page);
  await expect(t.getByRole("heading", { level: 2 })).toHaveText("Order ticket");
  await expect(t.locator("[data-source]").locator(".stoa-tag")).toHaveText("SIM");
  await expect(t).toContainText("Nothing is sent to a broker or the exchange, and no order is placed");
  await expect(t.getByRole("radio", { name: "Buy" })).toHaveAttribute("aria-checked", "true");
  // The limit is the best offer until a price is typed, and the yield to
  // the offer is worked out from it.
  await expect(price(page)).toHaveValue("102.0800");
  await expect(yieldField(page)).not.toHaveValue("");
  await expect(t).toContainText("Until you type, the limit is the best offer in the synthetic book.");
  await expect(t).toContainText("on the issue's price step of 0.01%");
  // The lots: ten bonds in lots of one.
  await expect(lots(page)).toHaveValue("10");

  const figures = t.getByTestId("ticket-figures");
  await expect(figures.getByRole("term")).toHaveText([
    "Clean price of a bond",
    "Accrued interest of a bond",
    "A bond with the accrued interest",
    "Bonds",
    "At the clean price",
    "Accrued interest",
    "Amount with the accrued interest",
    "Broker's fee, 0.05%",
    "To pay",
    /^Yield to the offer on Aug\s29,\s2027, at the limit price$/,
    /^Yield to maturity on .*, at the limit price$/,
    "The same yield after the broker's fee",
  ]);
  await expect(figures).toContainText("102.0800% · ₽1,020.80");
  // To pay is the amount and the fee, as the engine adds them.
  const amounts = await figures.locator("dd").allInnerTexts();
  // The first amount in roubles a value holds.
  const money = (s: string) => Number(/₽([\d,]+\.\d\d)/.exec(s)![1]!.replace(/,/g, ""));
  expect(money(amounts[4]!) + money(amounts[5]!)).toBeCloseTo(money(amounts[6]!), 2);
  expect(money(amounts[6]!) + money(amounts[7]!)).toBeCloseTo(money(amounts[8]!), 2);

  // The book fills all ten bonds at the best offer.
  const depth = t.getByTestId("ticket-depth");
  await expect(depth).toContainText("Against the synthetic order book of Oct 5, 2026 at noon, Moscow time.");
  await expect(depth.getByRole("definition")).toHaveText([
    "10 of 10 bonds",
    "102.0800%",
    "102.0800%",
    "0.0 bp",
    "1",
    "nothing: the book fills the whole order",
  ]);
  await expect(depth.getByRole("table", { name: "Fills by price level, best first" }).locator("tbody tr")).toHaveCount(1);
});

test("a larger order takes more price levels, with slippage, and says what would rest in the book", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUE}`);
  await ready(page);
  const depth = ticket(page).getByTestId("ticket-depth");
  await typeIn(price(page), "102.1");
  await expect(price(page)).toHaveValue("102.1000");
  await typeIn(lots(page), "3000");
  await expect(depth.getByRole("definition").first()).toHaveText("3,000 of 3,000 bonds");
  await expect(depth.getByRole("table", { name: "Fills by price level, best first" }).locator("tbody tr")).toHaveCount(2);
  const values = await depth.getByRole("definition").allInnerTexts();
  expect(values[4]).toBe("2");
  expect(values[3]).toMatch(/^\d+\.\d bp$/);
  expect(values[3]).not.toBe("0.0 bp");
  // More than the two levels hold: the rest would rest at the limit.
  await typeIn(lots(page), "100000");
  await expect(depth.getByRole("definition").first()).toHaveText("3,623 of 100,000 bonds");
  await expect(depth.getByRole("definition").last()).toHaveText("96,377 bonds, which would rest in the book at the limit");
  // Below the best offer, nothing fills.
  await typeIn(price(page), "101.5");
  await expect(depth.getByRole("definition").first()).toHaveText("0 of 100,000 bonds");
  await expect(depth).toContainText("Nothing fills at this limit: the best offer is above it.");
});

test("the engine's errors are said under the field typed in, and a yield gives the price on the step", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUE}`);
  await ready(page);
  const t = ticket(page);
  const review = t.getByRole("button", { name: "Review the order" });
  const limit = t.getByTestId("ticket-limit");
  // Off the price step.
  await typeIn(price(page), "102.125");
  await expect(price(page)).toHaveAttribute("aria-invalid", "true");
  await expect(limit).toContainText("The price is not on the issue's price step of 0.01%: the nearest prices on it are 102.1200% and 102.1300%.");
  await expect(review).toBeDisabled();
  await expect(t).toContainText("Put the limit and the quantity right first.");
  await expect(t.getByTestId("ticket-figures")).toContainText("No figures until the limit and the quantity are valid.");
  // Not above zero.
  await typeIn(price(page), "0");
  await expect(limit).toContainText("Enter a price above zero.");
  // A yield: the engine finds the price, on the step, and the order goes on.
  await typeIn(yieldField(page), "15");
  await expect(yieldField(page)).toHaveValue("15.00");
  await expect(price(page)).toHaveValue(/^\d+\.\d\d00$/);
  await expect(price(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(review).toBeEnabled();
  // A yield with no price.
  await typeIn(yieldField(page), "-100");
  await expect(limit).toContainText("No price at this yield: a limit yield must be above −99% and give a price above zero.");
  await expect(review).toBeDisabled();
});

test("a sale starts at the best bid and shows the yield given up after the fee; the side and the lots answer the keyboard", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUE}`);
  await ready(page);
  const t = ticket(page);
  await t.getByRole("radio", { name: "Buy" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(t.getByRole("radio", { name: "Sell" })).toHaveAttribute("aria-checked", "true");
  await expect(t.getByRole("radio", { name: "Sell" })).toBeFocused();
  await expect(price(page)).toHaveValue("102.0000");
  await expect(t).toContainText("Until you type, the limit is the best bid in the synthetic book.");
  const figures = t.getByTestId("ticket-figures");
  await expect(figures.getByRole("term").filter({ hasText: "To receive" })).toHaveCount(1);
  await expect(figures).toContainText("Yield to the offer given up by selling, after the broker's fee");
  await expect(t.getByTestId("ticket-depth")).toContainText("Best bid before the order");
  await expect(t.getByTestId("ticket-gate").getByRole("status")).toHaveText("Selling is open to every holder: the rules restrict who may buy.");
  // The lots by the arrow keys.
  await lots(page).focus();
  await page.keyboard.press("ArrowUp");
  await expect(lots(page)).toHaveValue("11");
  await expect(t.getByTestId("ticket-depth").getByRole("definition").first()).toHaveText("11 of 11 bonds");
});

test("the gate holds a purchase the investor's status does not allow, with the reason, and never a sale", async ({ page }) => {
  // A synthetic government bond: open to every investor.
  await page.goto(`/?lang=en&issue=${ISSUES.gov}`);
  await ready(page);
  await expect(ticket(page).getByTestId("ticket-gate")).toContainText("Every investor: a synthetic government bond.");
  await expect(ticket(page).getByTestId("ticket-gate").getByRole("status")).toHaveText("Open to every investor: the order can go on to its confirmation.");
  await expect(ticket(page).getByRole("button", { name: "Review the order" })).toBeEnabled();

  // Qualified investors only.
  await page.goto("/?lang=en&issue=BELB-02");
  await ready(page);
  let t = ticket(page);
  const gate = t.getByTestId("ticket-gate");
  // The reasons are the market engine's rule: the issue's terms, and its
  // subordination.
  await expect(gate.locator("[data-access]")).toHaveAttribute("data-access", "qualified");
  await expect(gate.locator("[data-access]")).toContainText(/^Qualified investors only: .*the issue's terms restrict it to qualified investors.*\.$/);
  await expect(gate).toContainText("Federal Law No. 39-FZ on the securities market, article 51.2");
  await expect(gate.getByRole("radio", { name: "Not a qualified investor", exact: true })).toBeChecked();
  await expect(gate.getByRole("status")).toHaveText("Only a qualified investor may buy this issue: a broker would not carry out the order.");
  await expect(t.getByRole("button", { name: "Review the order" })).toBeDisabled();
  await expect(t).toContainText("The qualification gate holds this order: see Who can buy.");
  await gate.getByText("Not a qualified investor, with the test for this kind of bond passed", { exact: true }).click();
  await expect(t.getByRole("button", { name: "Review the order" })).toBeDisabled();
  await gate.getByText("A qualified investor", { exact: true }).click();
  await expect(gate.getByRole("status")).toHaveText("A qualified investor may buy this issue.");
  await expect(t.getByRole("button", { name: "Review the order" })).toBeEnabled();
  // A sale is not held.
  await gate.getByText("Not a qualified investor", { exact: true }).click();
  await t.getByRole("radio", { name: "Sell" }).click();
  await expect(t.getByRole("button", { name: "Review the order" })).toBeEnabled();

  // After a passed test: a synthetic government bond on the key rate, whose
  // payments follow an index.
  await page.goto("/?lang=en&issue=SG-201");
  await ready(page);
  t = ticket(page);
  await expect(t.getByTestId("ticket-gate").locator("[data-access]")).toHaveText(
    "A non-qualified investor after a passed test: a synthetic government bond whose coupon or face value follows the key rate, RUONIA or inflation.",
  );
  await expect(t.getByTestId("ticket-gate")).toContainText("A bond whose payments follow an index has a structured income");
  await expect(t.getByTestId("ticket-gate").getByRole("status")).toHaveText(/^A broker carries out this purchase for a non-qualified investor only after a passed test/);

  // After a passed test: a corporate issue rated below the threshold.
  await page.goto("/?lang=en&issue=VLGE-01");
  await ready(page);
  t = ticket(page);
  await expect(t.getByTestId("ticket-gate").locator("[data-access]")).toContainText(/^A non-qualified investor after a passed test: a corporate issue rated below \S+ on the synthetic scale\.$/);
  await expect(t.getByTestId("ticket-gate").getByRole("status")).toHaveText(/^A broker carries out this purchase for a non-qualified investor only after a passed test/);
  await expect(t.getByRole("button", { name: "Review the order" })).toBeDisabled();
  await t.getByText("Not a qualified investor, with the test for this kind of bond passed", { exact: true }).click();
  await expect(t.getByTestId("ticket-gate").getByRole("status")).toHaveText("The passed test allows this purchase.");
  await expect(t.getByRole("button", { name: "Review the order" })).toBeEnabled();
});

test("the confirmation says nothing is sent, records a demo order in this browser only, and the record can be deleted", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUE}`);
  await ready(page);
  const t = ticket(page);
  const review = t.getByRole("button", { name: "Review the order" });
  await expect(t.getByTestId("ticket-depth").getByRole("definition").first()).toHaveText("10 of 10 bonds");
  await qualified(page);
  await review.click();
  const dialog = page.getByRole("alertdialog", { name: `Record a demo purchase of ${ISSUE}?` });
  await expect(dialog).toContainText(`Buy ${ISSUE}, bonds: 10 (lots: 10), at a limit of 102.0800% of face.`);
  await expect(dialog).toContainText("To pay: ₽");
  await expect(dialog).toContainText("The synthetic book would fill all of it at once, at an average price of 102.0800%.");
  await expect(dialog).toContainText("it sends nothing to a broker or the exchange and places no order. The ticket is recorded in this browser only");
  // The safe action has the focus; declining records nothing.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
  await expect(t.getByRole("status").filter({ hasText: "recorded in this browser" })).toHaveCount(0);
  await review.click();
  await dialog.getByRole("button", { name: "Record in this browser" }).click();
  const recorded = t.getByRole("status").filter({ hasText: "recorded in this browser" });
  await expect(recorded).toHaveText(new RegExp(`^Demo purchase recorded in this browser: ${ISSUE}, bonds: 10, at a limit of 102\\.0800%, to pay ₽[0-9,.]+\\. Not a real order: nothing was sent\\.$`));
  await expect(t.getByRole("button", { name: "Delete the record" })).toBeFocused();
  // Kept in this browser, not in the link.
  expect(new URL(page.url()).search).toBe(`?lang=en&issue=${ISSUE}`);
  await page.reload();
  await ready(page);
  await expect(recorded).toBeVisible();
  await t.getByRole("button", { name: "Delete the record" }).click();
  await expect(recorded).toHaveCount(0);
  await expect(review).toBeFocused();
});

test("in Russian, and on a phone without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?lang=ru&issue=${ISSUE}`);
  await ready(page);
  const t = ticket(page);
  await expect(t.getByRole("heading", { level: 2 })).toHaveText("Заявка");
  await expect(t.getByRole("radio", { name: "Купить" })).toHaveAttribute("aria-checked", "true");
  await expect(price(page)).toHaveValue("102,0800");
  await expect(t.getByTestId("ticket-figures").getByRole("term").filter({ hasText: "К оплате" })).toHaveCount(1);
  await expect(t.getByTestId("ticket-depth").getByRole("definition").first()).toHaveText("10 из 10 облигаций");
  await expect(t).toContainText("Ничего не отправляется брокеру или на биржу");
  await expectNoHorizontalScroll(page, "ticket at 375");
});
