// Arabic from the first paint: the page's language and direction are set
// by the HTML itself, before any script module runs, and the Arabic face
// is preloaded only when the page is in Arabic.
import { expect, test } from "@playwright/test";
import { ready } from "./helpers";

test("lang and dir come from the link or the last visit before the app's script runs", async ({ page }) => {
  // No module script at all: what is left is the HTML and its inline script.
  await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
  await page.route(/\/src\/.*$/, (route) => route.abort());
  await page.goto("/?lang=ar&theme=dark");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "ar");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.evaluate(() => localStorage.setItem("horkos-bonds.lang", "ru"));
  await page.goto("/");
  await expect(html).toHaveAttribute("lang", "ru");
  await expect(html).toHaveAttribute("dir", "ltr");
  await page.goto("/?lang=xx");
  await expect(html).toHaveAttribute("lang", "ru");
});

test("the Arabic faces are preloaded in Arabic only, and used", async ({ page }) => {
  const preloads = () => page.locator('link[rel="preload"][as="font"]').evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  await page.goto("/?lang=ar");
  await ready(page);
  // The words' face, and the digits' face of the numeric stack.
  const ar = await preloads();
  expect(ar).toHaveLength(2);
  expect(ar[0]).toMatch(/ibm-plex-sans-arabic-arabic-400-normal.*\.woff2$/);
  expect(ar[1]).toMatch(/noto-sans-arabic-arabic-400-normal.*\.woff2$/);
  // Each preloaded file is the one the page's font face uses, so none is
  // fetched twice.
  for (const name of ["ibm-plex-sans-arabic-arabic-400-normal", "noto-sans-arabic-arabic-400-normal"]) {
    const fetched = await page.evaluate((n) => performance.getEntriesByType("resource").filter((e) => e.name.includes(n)).length, name);
    expect(fetched, name).toBe(1);
  }
  await page.goto("/?lang=en");
  await ready(page);
  expect(await preloads()).toEqual([]);
});

test("in Arabic the filter chips keep their height when the numeric face arrives", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/noto-sans-arabic.*\.woff2$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/?lang=ar", { waitUntil: "commit" });
  await ready(page);
  const chip = page.locator(".stoa-filter-chip").first();
  const before = (await chip.boundingBox())!.height;
  release();
  await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes("Noto Sans Arabic") && f.status === "loaded"));
  await page.waitForTimeout(100);
  expect((await chip.boundingBox())!.height).toBe(before);
});
