// The page frame: Stoa's PageShell with a fixed header. The region under
// the header scrolls, the document does not, and every scrollbar is drawn
// thin in Stoa's scrollbar tokens, in the light and the dark theme.
import { expect, test } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

test("the header stays put while the page region scrolls to the bottom", async ({ page }) => {
  await page.goto(`/?issue=${ISSUES.floater}`);
  await ready(page);
  const header = page.locator(".stoa-app-header");
  const top = (await header.boundingBox())!.y;
  const region = page.locator(".stoa-page-shell__scroll");
  const scrolled = await region.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return { top: el.scrollTop, room: el.scrollHeight - el.clientHeight };
  });
  expect(scrolled.room).toBeGreaterThan(0);
  expect(scrolled.top).toBeGreaterThan(0);
  expect((await header.boundingBox())!.y).toBe(top);
  // The document itself does not scroll.
  expect(await page.evaluate(() => ({ y: window.scrollY, room: document.documentElement.scrollHeight - document.documentElement.clientHeight }))).toEqual({ y: 0, room: 0 });
  // The scroll region starts at or below the header's bottom edge.
  const headerBottom = await header.evaluate((el) => el.getBoundingClientRect().bottom);
  const regionTop = await region.evaluate((el) => el.getBoundingClientRect().top);
  expect(regionTop).toBeGreaterThanOrEqual(headerBottom - 0.5);
  // The footer is reachable at the bottom.
  await expect(page.locator(".stoa-page-shell__footer")).toBeInViewport();
});

test("the scroll keys scroll the page region with nothing focused", async ({ page }) => {
  await page.goto(`/?issue=${ISSUES.floater}`);
  await ready(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("PageDown");
  await expect.poll(() => page.locator(".stoa-page-shell__scroll").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`scrollbars resolve to Stoa's scrollbar tokens, thin (${theme})`, async ({ page }) => {
    await page.goto(`/?theme=${theme}&issue=${ISSUES.offer}`);
    await ready(page);
    const result = await page.evaluate(() => {
      const probe = (inside: Element) => {
        const el = document.createElement("div");
        el.style.scrollbarColor = "var(--stoa-color-scrollbar-thumb) var(--stoa-color-scrollbar-track)";
        inside.appendChild(el);
        const value = getComputedStyle(el).scrollbarColor;
        el.remove();
        return value;
      };
      const read = (selector: string) => {
        const el = document.querySelector(selector)!;
        const style = getComputedStyle(el);
        return { color: style.scrollbarColor, width: style.scrollbarWidth, expected: probe(el.parentElement!), scrolls: el.scrollHeight > el.clientHeight };
      };
      return { page: read(".stoa-page-shell__scroll"), list: read(".pane-list__scroll") };
    });
    for (const [name, s] of Object.entries(result)) {
      expect(s.scrolls, `${name} scrolls`).toBe(true);
      expect(s.color, name).toBe(s.expected);
      expect(s.color, name).not.toBe("auto");
      expect(s.width, name).toBe("thin");
    }
  });
}

for (const [width, height] of [
  [1280, 900],
  [375, 812],
] as const) {
  test(`the list's placeholder keeps the page below it in place while the engine loads (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/*.wasm", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/?lang=ar");
    await expect(page.locator(".app")).toHaveAttribute("data-state", "loading");
    const top = () => page.locator(".glossary").evaluate((el) => el.getBoundingClientRect().top);
    const loading = await top();
    release();
    await ready(page);
    const loaded = await top();
    // On a wide screen the Terms stay where they were; on a phone they start
    // below the fold, where a move is not seen.
    if (width >= 1024) expect(loaded).toBe(loading);
    else expect(Math.min(loading, loaded)).toBeGreaterThanOrEqual(height);
  });
}
