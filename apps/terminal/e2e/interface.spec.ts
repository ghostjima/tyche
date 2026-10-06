// The interface around the figures: the rating in a right-to-left
// sentence, tables on a phone, the issue list as one tab stop, the
// browser's Back on a phone, the diagnostics table and searching for OFZ
// in Russian.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

/** Every table region in `scope` that is wider than its box. */
async function overflowing(scope: Locator): Promise<string[]> {
  return scope.locator(".stoa-table-region").evaluateAll((regions) =>
    regions.filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => `${r.getAttribute("aria-label") ?? r.textContent?.slice(0, 40)}: ${r.scrollWidth} > ${r.clientWidth}`),
  );
}

test("in Arabic the rating tag keeps its minus after the letters", async ({ page }) => {
  await page.goto(`/?lang=ar&issue=${ISSUES.offer}`);
  await ready(page);
  const tag = page.locator(".issue-card .tags .stoa-tag").first();
  await expect(tag).toContainText("BBB-");
  // Where the minus and the first B are drawn, left to right.
  const order = await tag.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const at = text.indexOf("BBB-");
      if (at < 0) continue;
      const rect = (start: number) => {
        const r = document.createRange();
        r.setStart(node!, start);
        r.setEnd(node!, start + 1);
        return r.getBoundingClientRect().left;
      };
      return { b: rect(at), minus: rect(at + 3) };
    }
    return null;
  });
  expect(order).not.toBeNull();
  expect(order!.minus).toBeGreaterThan(order!.b);
});

for (const lang of ["en", "ru", "ar"] as const) {
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
  await page.goto("/");
  await ready(page);
  const list = page.getByRole("listbox", { name: "Bond issues" });
  await expect(list.getByRole("option")).toHaveCount(60);
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
  await page.goto("/");
  await ready(page);
  await page.getByRole("option", { name: ISSUES.ofz }).click();
  await expect(page.getByRole("button", { name: "Back to the list" })).toBeFocused();
}

test("on a phone the browser's Back returns from an issue to the list", async ({ page }) => {
  await openOnPhone(page);
  expect(new URL(page.url()).searchParams.get("issue")).toBe(ISSUES.ofz);
  await page.goBack();
  await expect(page.locator(".pane-list")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("issue")).toBeNull();
  await expect(page.getByRole("option", { name: ISSUES.ofz })).toBeFocused();
  // Forward opens it again.
  await page.goForward();
  await expect(page.locator(".issue-card")).toBeVisible();
});

test("on a phone the page's own Back button goes back in the history too", async ({ page }) => {
  await openOnPhone(page);
  await page.getByRole("button", { name: "Back to the list" }).click();
  await expect(page.getByRole("option", { name: ISSUES.ofz })).toBeFocused();
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
  ["en", 1280],
  ["ru", 1280],
  ["ar", 1280],
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

test("in Russian, OFZ is found by its Russian name and number", async ({ page }) => {
  await page.goto("/?lang=ru");
  await ready(page);
  const search = page.getByLabel("Поиск по эмитенту или тикеру");
  for (const query of ["ОФЗ 26217", "ОФЗ-26217", "офз26217"]) {
    await search.fill(query);
    await expect(page.getByRole("listbox").getByRole("option"), query).toHaveCount(1);
    await expect(page.getByRole("option", { name: ISSUES.ofz }), query).toBeVisible();
  }
});
