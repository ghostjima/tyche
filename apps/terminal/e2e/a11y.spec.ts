// axe on every main state of the screen, in each language and theme:
// zero serious or critical violations. And no sideways scroll at 1280 and
// 375 px wide.
import { expect, test, type Page } from "@playwright/test";
import { ISSUES, expectNoHorizontalScroll, expectNoSeriousViolations, ready } from "./helpers";

// Timing both engines runs 8,800 calls (two engines, two functions, 20
// warm-up and 200 kept batches of 10); a shared CI runner takes well over
// the default five seconds, so the rows get a minute to appear.
const TIMING_DONE = { timeout: 60_000 };

const LANGS = ["ru", "en"] as const;
const THEMES = ["light", "dark"] as const;

async function open(page: Page, lang: string, theme: string, query = "") {
  await page.goto(`/?lang=${lang}&theme=${theme}${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
}

for (const lang of LANGS) {
  for (const theme of THEMES) {
    test(`axe: ready states (${lang}, ${theme})`, async ({ page }) => {
      // The list with no issue open.
      await open(page, lang, theme);
      await ready(page);
      await expectNoSeriousViolations(page, "list", { lang, theme });

      // A fixed issue with an offer, the glossary open.
      await open(page, lang, theme, `&issue=${ISSUES.offer}`);
      await ready(page);
      await page.locator(".glossary summary").click();
      await expectNoSeriousViolations(page, "fixed issue with an offer", { lang, theme });

      // A floater with amortisation: scenarios and the coupon chart.
      await open(page, lang, theme, `&issue=${ISSUES.floater}`);
      await ready(page);
      await expect(page.getByTestId("floater")).toBeVisible();
      await expectNoSeriousViolations(page, "floater", { lang, theme });

      // A filter with no match: the empty state.
      await page.locator(".issue-list__search input").fill("zzzz");
      await expect(page.locator(".pane-list .stoa-empty-state")).toBeVisible();
      await expectNoSeriousViolations(page, "empty list", { lang, theme });

      // An engine error in the calculator.
      const amount = page.locator(".calculator .stoa-number input").first();
      await amount.fill("0");
      await amount.press("Enter");
      await expect(page.getByTestId("calc-error")).toBeVisible();
      await expectNoSeriousViolations(page, "calculation error", { lang, theme });

      // The diagnostics sheet, timed.
      await page.locator(".foot__actions button").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("dialog").locator(".diagnostics > button").click();
      await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(4, TIMING_DONE);
      await expectNoSeriousViolations(page, "diagnostics", { lang, theme });
    });

    test(`axe: loading, fallback and failure states (${lang}, ${theme})`, async ({ page }) => {
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/*.wasm", async (route) => {
        await held;
        await route.continue();
      });
      await open(page, lang, theme, `&issue=${ISSUES.offer}`);
      await expect(page.locator(".app")).toHaveAttribute("data-state", "loading");
      await expectNoSeriousViolations(page, "loading", { lang, theme });
      release();
      await ready(page);

      await page.unroute("**/*.wasm");
      await page.route("**/tyche_yield_bg*.wasm", (route) => route.abort());
      await open(page, lang, theme, `&issue=${ISSUES.offer}`);
      await ready(page, "twin");
      await expect(page.locator(".stoa-callout--warning")).toBeVisible();
      await expectNoSeriousViolations(page, "WebAssembly fallback", { lang, theme });

      await page.unroute("**/tyche_yield_bg*.wasm");
      await page.route("**/tyche_market_bg*.wasm", (route) => route.abort());
      await open(page, lang, theme);
      await expect(page.locator(".app")).toHaveAttribute("data-state", "failed");
      await expectNoSeriousViolations(page, "market failure", { lang, theme });
    });

    test(`axe and layout on a phone (${lang}, ${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await open(page, lang, theme);
      await ready(page);
      await expectNoHorizontalScroll(page, "list at 375");
      await expectNoSeriousViolations(page, "list on a phone", { lang, theme });
      await open(page, lang, theme, `&issue=${ISSUES.floater}`);
      await ready(page);
      await expectNoHorizontalScroll(page, "issue at 375");
      await expectNoSeriousViolations(page, "issue on a phone", { lang, theme });
    });
  }

  test(`no sideways scroll at 1280 px (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const id of Object.values(ISSUES)) {
      await page.goto(`/?lang=${lang}&issue=${id}`);
      await ready(page);
      await expectNoHorizontalScroll(page, `${id} at 1280`);
    }
  });
}
