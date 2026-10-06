// The interface around the figures: tables on a phone, the issue list as
// one tab stop, the browser's Back on a phone, the diagnostics table and
// searching for the synthetic government series in Russian.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

/** Every table region in `scope` that is wider than its box. */
async function overflowing(scope: Locator): Promise<string[]> {
  return scope.locator(".stoa-table-region").evaluateAll((regions) =>
    regions.filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => `${r.getAttribute("aria-label") ?? r.textContent?.slice(0, 40)}: ${r.scrollWidth} > ${r.clientWidth}`),
  );
}

for (const lang of ["ru", "en"] as const) {
  test(`at 375 px every table on an issue fits its box (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const id of [ISSUES.offer, ISSUES.floater]) {
      await page.goto(`/?lang=${lang}&issue=${id}`);
      await ready(page);
      await expect(page.getByTestId("result")).toBeVisible();
      expect(await overflowing(page.locator(".detail")), id).toEqual([]);
    }
  });
}

test("the issue list is one tab stop, moved through with the arrow keys", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  const list = page.getByRole("listbox", { name: "Bond issues" });
  await expect(list.getByRole("option")).toHaveCount(188);
  // From the sort, one Tab reaches the list and the next leaves it.
  await page.getByRole("button", { name: /Sort by/ }).focus();
  await page.keyboard.press("Tab");
  const first = list.getByRole("option").first();
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(list.getByRole("option").nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(list.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".issue-card")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(list.locator(":focus")).toHaveCount(0);
});

async function openOnPhone(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=en");
  await ready(page);
  await page.getByRole("option", { name: ISSUES.gov }).click();
  await expect(page.getByRole("button", { name: "Back to the list" })).toBeFocused();
}

test("on a phone the browser's Back returns from an issue to the list", async ({ page }) => {
  await openOnPhone(page);
  expect(new URL(page.url()).searchParams.get("issue")).toBe(ISSUES.gov);
  // The history entry is marked under the product's own key.
  expect(await page.evaluate(() => history.state)).toMatchObject({ tycheIssue: ISSUES.gov });
  await page.goBack();
  await expect(page.locator(".pane-list")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("issue")).toBeNull();
  await expect(page.getByRole("option", { name: ISSUES.gov })).toBeFocused();
  // Forward opens it again.
  await page.goForward();
  await expect(page.locator(".issue-card")).toBeVisible();
});

test("on a phone an issue picked with the keyboard opens with the focus on Back, which Enter did not press", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=en");
  await ready(page);
  await page.getByRole("option", { name: ISSUES.gov }).focus();
  await page.keyboard.press("Enter");
  // No frame's wait in the app: Stoa's list cancels Enter's own action,
  // so the Back button takes the focus and stays unpressed.
  await expect(page.getByRole("button", { name: "Back to the list" })).toBeFocused();
  await expect(page.locator(".issue-card")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("issue")).toBe(ISSUES.gov);
});

test("on a phone the filters fold into a sheet that the search stays beside", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=en");
  await ready(page);
  await expect(page.getByRole("searchbox", { name: "Search by issuer or ticker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Floater 57" })).toBeHidden();
  const open = page.getByRole("button", { name: "Filters", exact: true });
  await open.click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet.getByRole("button", { name: "Floater 57" }).click();
  await sheet.getByRole("button", { name: "Show results (57)" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".pane-list [role=option]")).toHaveCount(57);
  await expect(page.getByRole("button", { name: /^Filters/ })).toBeFocused();
  await expect(page.getByRole("button", { name: /^Filters/ })).toContainText("1");
});

test("on a phone the page's own Back button goes back in the history too", async ({ page }) => {
  await openOnPhone(page);
  await page.getByRole("button", { name: "Back to the list" }).click();
  await expect(page.getByRole("option", { name: ISSUES.gov })).toBeFocused();
  expect(new URL(page.url()).searchParams.get("issue")).toBeNull();
  // It went back rather than adding an entry: Forward opens the issue
  // again, and Back from the list leaves the page.
  await page.goForward();
  await expect(page.locator(".issue-card")).toBeVisible();
  await page.goBack();
  await page.goBack();
  expect(page.url()).toBe("about:blank");
});

test("on a phone the search shortcut goes back to the list and into the search", async ({ page }) => {
  await openOnPhone(page);
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search by issuer or ticker")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("issue")).toBeNull();
});

for (const [lang, width] of [
  ["ru", 1280],
  ["en", 1280],
  ["ru", 375],
] as const) {
  test(`the diagnostics timing table fits the sheet (${lang}, ${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?lang=${lang}&issue=${ISSUES.offer}`);
    await ready(page);
    await page.locator(".foot__actions button").first().click();
    const sheet = page.getByRole("dialog");
    await sheet.locator(".diagnostics > button").click();
    await expect(sheet.locator("tbody tr")).toHaveCount(4, { timeout: 60_000 });
    expect(await overflowing(sheet)).toEqual([]);
  });
}

test("in Russian, a synthetic government bond is found by its Russian code and number", async ({ page }) => {
  await page.goto("/?lang=ru");
  await ready(page);
  const search = page.getByLabel("Поиск по эмитенту или тикеру");
  for (const query of ["СГ 143", "СГ-143", "сг143"]) {
    await search.fill(query);
    await expect(page.getByRole("listbox").getByRole("option"), query).toHaveCount(1);
    await expect(page.getByRole("option", { name: ISSUES.gov }), query).toBeVisible();
  }
});
