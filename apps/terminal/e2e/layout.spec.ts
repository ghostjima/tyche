// The page frame: Stoa's PageShell with a fixed header. The region under
// the header scrolls, the document does not, and every scrollbar is drawn
// thin in Stoa's scrollbar tokens, in the light and the dark theme.
import { expect, test } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

test("the header stays put while the page region scrolls to the bottom", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.floater}`);
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
  await page.goto(`/?lang=en&issue=${ISSUES.floater}`);
  await ready(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("PageDown");
  await expect.poll(() => page.locator(".stoa-page-shell__scroll").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`scrollbars resolve to Stoa's scrollbar tokens, thin (${theme})`, async ({ page }) => {
    await page.goto(`/?lang=en&theme=${theme}&issue=${ISSUES.offer}`);
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

// A line at line-height: normal takes the face's own ascent and descent,
// which differ between the web font and whatever fallback the platform has
// (a Linux runner's differs from a Mac's): such a line changes height when
// the fonts arrive, and moves everything under it.
test("no text on the page takes its line height from the face", async ({ page }) => {
  for (const query of ["?lang=ru", `?lang=en&issue=${ISSUES.offer}`, "?lang=ru&page=data"]) {
    await page.goto(`/${query}`);
    await ready(page);
    const normal = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ""))
        .filter((el) => getComputedStyle(el).lineHeight === "normal" && el.getBoundingClientRect().height > 0)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`),
    );
    expect([...new Set(normal)], query).toEqual([]);
  }
});

for (const [width, height] of [
  [1280, 900],
  [375, 812],
] as const) {
  // The header sits above everything else: a line of it that took the
  // face's own height would move the whole page when the web fonts
  // arrive, a moment that depends on the machine's load.
  test(`the header keeps its height when the web fonts arrive (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\.woff2$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/?lang=ru", { waitUntil: "commit" });
    await ready(page);
    const header = () => page.locator(".stoa-app-header").evaluate((el) => el.getBoundingClientRect().height);
    const before = await header();
    release();
    await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes("IBM Plex Sans") && f.status === "loaded"));
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loading").length)).toBe(0);
    expect(await header()).toBe(before);
  });

  test(`the list's placeholder keeps the page below it in place while the engine loads (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    // The web fonts are held with the engine and arrive with it, as they
    // can on a busy machine: the page is measured in the fallback face
    // while it loads and in the web fonts once it is ready.
    await page.route(/\.(wasm|woff2)$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/?lang=ru", { waitUntil: "commit" });
    await expect(page.locator(".app")).toHaveAttribute("data-state", "loading");
    const top = () => page.locator(".glossary").evaluate((el) => el.getBoundingClientRect().top);
    const loading = await top();
    release();
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.includes("IBM Plex Sans") && f.status === "loaded"))).toBe(true);
    const loaded = await top();
    // On a wide screen the Terms stay where they were; on a phone they start
    // below the fold, where a move is not seen.
    if (width >= 1024) expect(loaded).toBe(loading);
    else expect(Math.min(loading, loaded)).toBeGreaterThanOrEqual(height);
  });
}
