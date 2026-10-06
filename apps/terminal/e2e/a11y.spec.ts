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

      // A goal on, with its sentence; "Money by a date" with its month.
      await open(page, lang, theme, "&f=durShort&f=ratingHigh&f=fixed&f=keyRate&f=open&f=liquid");
      await ready(page);
      await expect(page.locator(".goals__note")).toBeVisible();
      await expectNoSeriousViolations(page, "goal with its filters", { lang, theme });
      await open(page, lang, theme, "&by=2027-10");
      await ready(page);
      await expect(page.locator(".goals__by")).toBeVisible();
      await expectNoSeriousViolations(page, "money by a date", { lang, theme });

      // The data and licensing page.
      await open(page, lang, theme, "&page=data");
      await ready(page);
      await expect(page.locator(".data-page")).toBeVisible();
      await expectNoSeriousViolations(page, "data and licensing", { lang, theme });

      // A fixed issue with an offer, the glossary and the working open.
      await open(page, lang, theme, `&issue=${ISSUES.offer}`);
      await ready(page);
      await page.locator(".glossary summary").click();
      await page.getByTestId("working").locator("summary").click();
      await expect(page.locator(".working .stoa-table").first()).toBeVisible();
      await expectNoSeriousViolations(page, "fixed issue with an offer", { lang, theme });

      // A broker's fee out of range: the field's message, the yield
      // block's and the calculator's.
      const fee = page.getByTestId("fee").locator("input");
      await fee.fill("2");
      await fee.press("Enter");
      await expect(page.getByTestId("fee").getByRole("alert")).toBeVisible();
      await expect(page.locator(".calculator").getByTestId("calc-error")).toBeVisible();
      await expectNoSeriousViolations(page, "fee out of range", { lang, theme });

      // The risks at their fullest: subordinated, qualified only, a
      // negative outlook, a thin market.
      await open(page, lang, theme, "&issue=BELB-02");
      await ready(page);
      await expect(page.getByTestId("liquidity-warning")).toBeVisible();
      await expectNoSeriousViolations(page, "issue with every risk", { lang, theme });

      // Three issues compared, with the analogues and the map's table open.
      await open(page, lang, theme, `&issue=BELB-02&cmp=${ISSUES.offer}&cmp=BELB-02&cmp=NEVB-01`);
      await ready(page);
      await page.getByTestId("analogues").locator(".peer-map__data summary").click();
      await expect(page.locator(".compare")).toBeVisible();
      await expectNoSeriousViolations(page, "comparison and analogues", { lang, theme });

      // A floater with amortisation: scenarios and the coupon chart.
      await open(page, lang, theme, `&issue=${ISSUES.floater}`);
      await ready(page);
      await expect(page.getByTestId("floater")).toBeVisible();
      await expectNoSeriousViolations(page, "floater", { lang, theme });

      // A filter with no match: the empty state.
      await page.getByRole("searchbox").fill("zzzz");
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
      await open(page, lang, theme, "&by=2027-10");
      await ready(page);
      await expectNoHorizontalScroll(page, "money by a date at 375");
      await expectNoSeriousViolations(page, "money by a date on a phone", { lang, theme });
      await open(page, lang, theme, `&cmp=${ISSUES.offer}&cmp=BELB-02&cmp=${ISSUES.floater}`);
      await ready(page);
      await expectNoHorizontalScroll(page, "comparison at 375");
      await expectNoSeriousViolations(page, "comparison on a phone", { lang, theme });
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
