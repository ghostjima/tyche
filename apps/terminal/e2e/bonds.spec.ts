// The main tasks: finding an issue, reading it, and planning a holding in
// the calculator, by pointer and by keyboard; the loading, empty and
// error states; and the narrow layout.
import { expect, test } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

test("the list shows the synthetic universe, filters by chips with counts, and searches", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  const rows = page.locator(".pane-list [role=option]");
  const shown = page.locator(".stoa-filter-bar__count");
  await expect(rows).toHaveCount(188);
  await expect(shown).toHaveText("188 of 188 shown");
  // The filters are one search landmark, named.
  await expect(page.getByRole("search", { name: "Issue filters" })).toBeVisible();

  const floater = page.getByRole("button", { name: "Floater 57" });
  await floater.click();
  await expect(floater).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(57);
  // Counts follow the other groups: synthetic government floaters are
  // eight, four on the key rate and four on RUONIA.
  await expect(page.getByRole("button", { name: "Synthetic government 8" })).toBeVisible();
  await page.getByRole("button", { name: "Synthetic government 8" }).click();
  await expect(rows).toHaveCount(8);
  await expect(shown).toHaveText("8 of 188 shown");

  // Clear all turns every chip off and takes the focus to the search box.
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(rows).toHaveCount(188);
  await expect(page.getByRole("searchbox", { name: "Search by issuer or ticker" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Clear all" })).toHaveCount(0);

  await page.getByLabel("Search by issuer or ticker").fill("kama");
  await expect(rows).toHaveCount(6);
  for (const row of await rows.all()) await expect(row).toContainText("Kama");
});

test("a search with no match shows an empty state that clears the filters", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await page.getByLabel("Search by issuer or ticker").fill("no such issuer");
  await expect(page.getByText("No issues match")).toBeVisible();
  await expect(page.locator(".pane-list [role=listbox]")).toHaveCount(0);
  await page.locator(".stoa-empty-state").getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator(".pane-list [role=option]")).toHaveCount(188);
  await expect(page.getByLabel("Search by issuer or ticker")).toHaveValue("");
});

test("sorting by maturity puts the soonest first", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await page.getByRole("button", { name: /Sort by/ }).click();
  await page.getByRole("option", { name: "Maturity, soonest first" }).click();
  const first = page.locator(".pane-list [role=option]").first();
  await expect(first).toContainText("PCHC-01");
  await expect(first).toContainText("Jan 23, 2027");
});

test("an issue shows its figures, schedule, payments and price curve", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await expect(page.getByText("Choose an issue")).toBeVisible();
  await page.getByRole("option", { name: ISSUES.offer }).click();
  expect(new URL(page.url()).searchParams.get("issue")).toBe(ISSUES.offer);
  const card = page.locator(".issue-card");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("Kama Lease Solutions");
  await expect(card.getByText("Put offer on Aug 29, 2027")).toBeVisible();
  const figures = page.getByTestId("figures");
  for (const label of ["Clean price", "Accrued interest", "Dirty price", "Yield to maturity", "Yield to the offer", "Duration"]) {
    await expect(figures.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(figures).toContainText("15.79%");
  await expect(figures).toContainText("14.60%");
  await expect(page.getByRole("img", { name: /^Payments to maturity\./ })).toBeVisible();
  await expect(page.getByRole("table", { name: "Payments per bond" }).locator("tbody tr")).toHaveCount(7);
  await expect(page.getByRole("figure", { name: "Dirty price against yield to maturity" })).toBeVisible();
  // The selected row says so.
  await expect(page.getByRole("option", { name: ISSUES.offer })).toHaveAttribute("aria-selected", "true");
});

test("the calculator breaks the total into signed lines and compares the offer", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  const result = page.getByTestId("result");
  const breakdown = page.getByRole("table", { name: "Where the total comes from" });
  await expect(breakdown.getByRole("row", { name: /Coupons/ })).toContainText("+₽");
  // Costs carry the minus sign (U+2212), not a hyphen.
  await expect(breakdown.getByRole("row", { name: /^Tax/ })).toContainText("\u2212₽");
  await expect(breakdown.getByRole("row", { name: /Broker's commission/ })).toContainText("\u2212₽");
  await expect(breakdown.getByRole("row", { name: /^Total/ })).toContainText("₽113,165.16");
  await expect(page.getByTestId("offer").getByRole("row", { name: /Sell back on Aug 29, 2027/ })).toContainText("12.71%");

  await page.getByLabel("Amount, ₽").fill("250000");
  await page.getByLabel("Amount, ₽").press("Enter");
  await expect(result).toContainText("Bonds bought");
  await expect(result.locator(".stoa-metric").filter({ hasText: "Bonds bought" })).toContainText("241");

  // Holding to maturity: no sale, so the key rate does not matter.
  await page.getByRole("button", { name: "Maturity", exact: true }).click();
  await expect(page.getByTestId("early-exit")).toContainText("The plan holds to maturity");
  await expect(breakdown.getByRole("row", { name: /Redemption at maturity/ })).toBeVisible();

  // IIS type B: no tax.
  await page.getByRole("radio", { name: "IIS type B" }).click();
  await expect(breakdown.getByRole("row", { name: /^Tax/ })).toContainText("₽0.00");
  // The regime's explanation is the group's description, read with it.
  await expect(page.getByRole("radiogroup", { name: "Tax regime" })).toHaveAccessibleDescription(/Individual investment account \(IIS\) of type B/);
});

test("a floater shows three key-rate scenarios with a coupon chart", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.floater}`);
  await ready(page);
  const floater = page.getByTestId("floater");
  const rows = floater.getByRole("table", { name: "Totals at the horizon by key rate scenario" }).locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("\u22122 pp");
  await expect(rows.nth(1)).toContainText("Unchanged");
  await expect(rows.nth(2)).toContainText("+2 pp");
  await expect(floater.getByRole("figure", { name: "Coupon per bond by payment date" })).toBeVisible();
  // Floaters have no fixed-coupon price curve.
  await expect(page.getByRole("figure", { name: "Dirty price against yield to maturity" })).toHaveCount(0);
});

test("engine error codes become sentences, with a way back", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.gov}`);
  await ready(page);
  const amount = page.getByLabel("Amount, ₽");
  for (const [value, code, text] of [
    ["0", "amount_not_positive", "Enter an amount above zero."],
    ["500", "amount_below_one_bond", "The amount does not buy one bond at the dirty price."],
    ["2000000000", "amount_too_large", "The amount is above the calculator's limit of one billion roubles."],
  ] as const) {
    await amount.fill(value);
    await amount.press("Enter");
    const error = page.getByTestId("calc-error");
    await expect(error).toHaveAttribute("data-code", code);
    await expect(error.getByRole("alert")).toContainText(text);
  }
  await page.getByRole("button", { name: "Reset the inputs" }).click();
  await expect(page.getByTestId("calc-error")).toHaveCount(0);
  await expect(amount).toHaveValue("100,000");
});

test("keyboard: search, open an issue and change the plan", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search by issuer or ticker")).toBeFocused();
  await page.keyboard.type(ISSUES.amortising);
  // Tab leaves the field, then each chip group, the sort and the list are
  // one stop each.
  const link = page.getByRole("option", { name: ISSUES.amortising });
  for (let i = 0; i < 12 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".issue-card").getByRole("heading", { level: 2 })).toHaveText("Ilmen Freight Lines");

  const total = page.getByRole("table", { name: "Where the total comes from" }).getByRole("row", { name: /^Total/ });
  const before = await total.textContent();
  const horizon = page.getByRole("slider", { name: "Holding horizon" });
  await horizon.focus();
  await page.keyboard.press("PageUp");
  await expect(total).not.toHaveText(before ?? "");

  const reinvest = page.getByRole("switch", { name: /Reinvest payments/ });
  await reinvest.focus();
  await page.keyboard.press("Space");
  await expect(reinvest).not.toBeChecked();
  await expect(page.getByRole("table", { name: "Where the total comes from" }).getByRole("row", { name: /reinvested/ })).toHaveCount(0);

  const shift = page.getByRole("slider", { name: "Key rate change by the horizon" });
  await shift.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(shift).toHaveAttribute("aria-valuetext", "+1.0 pp");
  await expect(page.getByTestId("early-exit")).toContainText("Total if the key rate changes by +1.0 pp");
});

test("keyboard shortcuts are listed in a dialog", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toContainText("Search the issues");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("on a phone the issue replaces the list, and Back returns to its row", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=en");
  await ready(page);
  const link = page.getByRole("option", { name: ISSUES.gov });
  await link.click();
  const back = page.getByRole("button", { name: "Back to the list" });
  await expect(back).toBeFocused();
  await expect(page.locator(".pane-list")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Calculator" })).toBeVisible();
  await back.press("Enter");
  await expect(page.getByRole("option", { name: ISSUES.gov })).toBeFocused();
});

test("while the engine loads the list says so", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/*.wasm", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/?lang=en");
  await expect(page.locator(".app")).toHaveAttribute("data-state", "loading");
  await expect(page.getByText("Loading the bond engine…")).toBeAttached();
  await expect(page.locator(".workspace")).toHaveAttribute("aria-busy", "true");
  release();
  await ready(page);
  await expect(page.locator(".pane-list [role=option]")).toHaveCount(188);
});

test("without WebAssembly the TypeScript engine takes over, and WebAssembly can be retried", async ({ page }) => {
  await page.route("**/tyche_yield_bg*.wasm", (route) => route.abort());
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page, "twin");
  await expect(page.getByText("WebAssembly did not load")).toBeVisible();
  await expect(page.getByTestId("figures")).toContainText("15.79%");
  await page.unroute("**/tyche_yield_bg*.wasm");
  await page.getByRole("button", { name: "Try WebAssembly again" }).click();
  await ready(page, "wasm");
  await expect(page.getByText("WebAssembly did not load")).toHaveCount(0);
  await expect(page.getByTestId("figures")).toContainText("15.79%");
  // The notice left with the retry: the focus moved on to the next stop
  // where it was, the list's source link, instead of falling to the page.
  await expect(page.locator(".pane-list .source-note").getByRole("link", { name: "Data and licensing" })).toBeFocused();
});

test("on a phone, after WebAssembly loads on a retry, the focus moves on to the Back button", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/tyche_yield_bg*.wasm", (route) => route.abort());
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page, "twin");
  await page.unroute("**/tyche_yield_bg*.wasm");
  await page.getByRole("button", { name: "Try WebAssembly again" }).click();
  await ready(page, "wasm");
  await expect(page.getByRole("button", { name: "Back to the list" })).toBeFocused();
});

test("without the market's WebAssembly the page says the market did not load, and loads it again", async ({ page }) => {
  await page.route("**/tyche_market_bg*.wasm", (route) => route.abort());
  await page.goto("/?lang=en");
  await expect(page.locator(".app")).toHaveAttribute("data-state", "failed");
  await expect(page.getByText("The market did not load")).toBeVisible();
  await expect(page.locator(".pane-list")).toHaveCount(0);
  await page.unroute("**/tyche_market_bg*.wasm");
  await page.getByRole("button", { name: "Load the market again" }).click();
  await ready(page);
  await expect(page.locator(".pane-list [role=option]")).toHaveCount(188);
  await expect(page.getByText("The market did not load")).toHaveCount(0);
  // The focus did not fall to the page with the notice.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test("a link to an issue the universe does not have opens the list", async ({ page }) => {
  await page.goto("/?lang=en&issue=OFZ-26217");
  await ready(page);
  await expect(page.getByText("Choose an issue")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("issue")).toBeNull();
});

test("the foot of the page credits the Bank of Russia with a link to cbr.ru, in each language", async ({ page }) => {
  for (const [lang, text] of [
    ["ru", "данные Банка России"],
    ["en", "the Bank of Russia's"],
  ] as const) {
    await page.goto(`/?lang=${lang}`);
    await ready(page);
    const foot = page.locator(".foot");
    await expect(foot).toContainText(text);
    await expect(foot.getByRole("link", { name: "cbr.ru" })).toHaveAttribute("href", "https://www.cbr.ru/");
  }
});
