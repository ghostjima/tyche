// Compare and analogues: up to three issues side by side, with the
// G-spread to the Bank of Russia's zero-coupon curve; the analogues of an
// issue, one step from opening them; the map of peers by rating and
// duration, with its table. The comparison lives in the URL.
import { expect, test, type Page } from "@playwright/test";
import { ISSUES, expectNoHorizontalScroll, ready } from "./helpers";

const compare = (page: Page) => page.getByRole("region", { name: /^(Comparison|Сравнение)$/ });
const params = (page: Page) => new URL(page.url()).searchParams;

test("issues join the comparison from their card, three at most, and leave it from the comparison", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  await expect(compare(page)).toHaveCount(0);
  const add = page.locator(".issue-card").getByRole("button", { name: "Add to the comparison" });
  await add.click();
  await expect(page.locator(".issue-card").getByRole("button", { name: "Remove from the comparison" })).toBeFocused();
  await expect(compare(page)).toBeVisible();
  expect(params(page).getAll("cmp")).toEqual([ISSUES.offer]);
  for (const id of [ISSUES.floater, ISSUES.gov]) {
    await page.goto(`/?lang=en&issue=${id}&${params(page).getAll("cmp").map((c) => `cmp=${c}`).join("&")}`);
    await ready(page);
    await page.locator(".issue-card").getByRole("button", { name: "Add to the comparison" }).click();
  }
  expect(params(page).getAll("cmp")).toEqual([ISSUES.offer, ISSUES.floater, ISSUES.gov]);
  const table = compare(page).getByRole("table", { name: "Issues side by side" });
  await expect(table.getByRole("columnheader")).toHaveCount(4);
  // A fourth does not fit: the card says so instead of offering it.
  await page.goto(`/?lang=en&issue=${ISSUES.amortising}&cmp=${ISSUES.offer}&cmp=${ISSUES.floater}&cmp=${ISSUES.gov}`);
  await ready(page);
  await expect(page.locator(".issue-card").getByText("Up to three issues can be compared")).toBeVisible();
  await expect(page.locator(".issue-card").getByRole("button", { name: "Add to the comparison" })).toHaveCount(0);
  // Taking one out moves the focus on, not to the page.
  await compare(page).getByRole("button", { name: `Remove ${ISSUES.floater}` }).click();
  await expect(table.getByRole("columnheader")).toHaveCount(3);
  expect(params(page).getAll("cmp")).toEqual([ISSUES.offer, ISSUES.gov]);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await expect(page.locator(".issue-card").getByRole("button", { name: "Add to the comparison" })).toBeVisible();
});

test("the comparison sets the measures side by side, the G-spread with them, and names its sources", async ({ page }) => {
  await page.goto(`/?lang=en&cmp=${ISSUES.offer}&cmp=NEVB-01&cmp=BELB-02`);
  await ready(page);
  const table = compare(page).getByRole("table", { name: "Issues side by side" });
  await expect(table.getByRole("rowheader")).toHaveText([
    "Yield to maturity",
    "Yield to the offer",
    "After tax and the fee, to the nearest exit, nothing reinvested",
    "Duration, Macaulay",
    "Synthetic rating",
    "Coupon",
    "Offer",
    "Amortisation",
    "Liquidity",
    "Who can buy",
    "G-spread to the zero-coupon curve of federal loan bonds",
  ]);
  const row = (name: string) => table.getByRole("row", { name: new RegExp(`^${name}`) }).getByRole("cell");
  await expect(row("Yield to maturity").first()).toHaveText("15.79%");
  await expect(row("Synthetic rating").nth(2)).toHaveText("BB+, outlook negative");
  await expect(row("Liquidity").nth(2)).toHaveText("Thin market, spread 8.55%");
  await expect(row("Who can buy").nth(2)).toHaveText("Qualified only");
  // A G-spread in basis points; an inflation-linked issue's is not compared.
  await expect(row("G-spread").first()).toHaveText("+145 bp");
  await expect(row("G-spread").nth(1)).toHaveText("not compared: the yield is real");
  const sources = compare(page).locator(":scope .stoa-source-note");
  await expect(sources).toHaveCount(2);
  await expect(compare(page).locator(".stoa-source-note").filter({ hasText: "Bank of Russia" }).getByRole("link", { name: "moex.com" })).toBeVisible();
  // An issue the universe does not have leaves the link.
  await page.goto(`/?lang=en&cmp=${ISSUES.offer}&cmp=NOPE-01`);
  await ready(page);
  await expect(compare(page).getByRole("columnheader")).toHaveCount(2);
  expect(params(page).getAll("cmp")).toEqual([ISSUES.offer]);
});

test("analogues are one step from opening, and sit on the map of peers with a table of its points", async ({ page }) => {
  await page.goto(`/?lang=en&issue=BELB-02`);
  await ready(page);
  const analogues = page.getByTestId("analogues");
  await expect(analogues.getByRole("heading", { level: 3 })).toHaveText("Analogues");
  await expect(analogues).toContainText("within a notch of the synthetic rating and half a year of duration");
  const table = analogues.getByRole("table", { name: "Issues like BELB-02" });
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(5);
  await expect(table.getByRole("columnheader")).toHaveText(["Issue", "Yield", "G-spread"]);
  await expect(rows.first()).toContainText(/BB|BBB/);
  await expect(rows.first()).toContainText("duration");
  const map = analogues.getByRole("figure", { name: "Peers by rating and duration" });
  await expect(map).toHaveAccessibleDescription(/BELB-02 is the diamond, its analogues are squares/);
  // Stoa's ScatterChart: a legend of the four shapes, one tab stop whose
  // arrow keys walk the points and read each one, and the data table of
  // the highlighted points behind its disclosure.
  // The legend names the categories that have points: nothing is compared here.
  await expect(map.locator(".stoa-chart__legend-item")).toHaveText(["This issue", "Analogue", "Other issue"]);
  const plot = map.getByRole("application", { name: "Peers by rating and duration" });
  await plot.focus();
  await page.keyboard.press("Home");
  await expect(map.getByRole("status")).toContainText(/ · /);
  await map.getByText("Data table").click();
  const points = map.getByRole("table", { name: "Highlighted issues on the map" });
  await expect(points.locator("tbody tr")).toHaveCount(6);
  await expect(points.locator("tbody tr").first()).toContainText("This issue");
  await expect(points.locator("tbody tr").first()).toContainText("BELB-02");
  // Opening an analogue opens its card, and the focus stays in the card.
  const first = (await rows.first().getByRole("button").innerText()).trim();
  await table.getByRole("button", { name: `Open ${first}` }).click();
  await expect.poll(() => params(page).get("issue")).toBe(first);
  await expect(page.locator(".issue-card")).toContainText(first);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test("по-русски: сравнение, похожие выпуски и G-спред", async ({ page }) => {
  await page.goto(`/?lang=ru&issue=${ISSUES.offer}&cmp=${ISSUES.offer}`);
  await ready(page);
  await expect(compare(page).getByRole("table", { name: "Выпуски рядом" })).toBeVisible();
  await expect(compare(page)).toContainText("G-спред к кривой бескупонной доходности ОФЗ");
  await expect(compare(page)).toContainText("б. п.");
  await expect(page.getByTestId("analogues").getByRole("heading", { level: 3 })).toHaveText("Похожие");
  await expect(page.locator(".issue-card").getByRole("button", { name: "Убрать из сравнения" })).toBeVisible();
});

test("on a phone the comparison and the map fit the screen without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?lang=ru&issue=BELB-02&cmp=${ISSUES.offer}&cmp=BELB-02&cmp=${ISSUES.floater}`);
  await ready(page);
  await expect(page.getByTestId("analogues").getByRole("figure")).toBeVisible();
  await expectNoHorizontalScroll(page, "issue with the comparison at 375");
  // The map's table, open, wraps its headers rather than scroll sideways
  // in its own box.
  const map = page.getByTestId("analogues").getByRole("figure");
  await map.getByText("Таблица данных").click();
  const region = map.locator(".stoa-chart__data .stoa-table-region");
  await expect(region.locator("tbody tr").first()).toBeVisible();
  expect(await region.evaluate((r) => r.scrollWidth - r.clientWidth)).toBe(0);
  await expectNoHorizontalScroll(page, "issue with the map's table at 375");
  await page.goto(`/?lang=en&cmp=${ISSUES.offer}&cmp=BELB-02&cmp=${ISSUES.floater}`);
  await ready(page);
  await expect(compare(page)).toBeVisible();
  await expectNoHorizontalScroll(page, "list with the comparison at 375");
});
