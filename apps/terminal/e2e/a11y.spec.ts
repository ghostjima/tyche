// axe on every main state of the screen, in each language and theme:
// zero serious or critical violations. And no sideways scroll at 1280 and
// 375 px wide.
import { expect, test, type Page } from "@playwright/test";
import { ISSUES, PORTFOLIO, PORTFOLIO_PUT, expectNoHorizontalScroll, expectNoSeriousViolations, ready } from "./helpers";

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

// The main states of the screen when the engines are ready, each set up
// from a fresh navigation. One test per state: a scan takes seconds on a
// shared CI runner wherever the issue list, about 3,000 elements, is on
// the screen, and eleven scans in one test grew past the test timeout.
// The state names are what the badge counts; a scan is recorded per test.
type Prepare = (page: Page, lang: string, theme: string) => Promise<void>;

async function floater(page: Page, lang: string, theme: string) {
  await open(page, lang, theme, `&issue=${ISSUES.floater}`);
  await ready(page);
  await expect(page.getByTestId("floater")).toBeVisible();
}

const READY_STATES: Record<string, Prepare> = {
  // The list with no issue open.
  list: async (page, lang, theme) => {
    await open(page, lang, theme);
    await ready(page);
  },
  // A goal on, with its sentence; "Money by a date" with its month.
  "goal with its filters": async (page, lang, theme) => {
    await open(page, lang, theme, "&f=durShort&f=ratingHigh&f=fixed&f=keyRate&f=open&f=liquid");
    await ready(page);
    await expect(page.locator(".goals__note")).toBeVisible();
  },
  "money by a date": async (page, lang, theme) => {
    await open(page, lang, theme, "&by=2027-10");
    await ready(page);
    await expect(page.locator(".goals__by")).toBeVisible();
  },
  // The data and licensing page.
  "data and licensing": async (page, lang, theme) => {
    await open(page, lang, theme, "&page=data");
    await ready(page);
    await expect(page.locator(".data-page")).toBeVisible();
  },
  // A fixed issue with an offer, the glossary and the working open.
  "fixed issue with an offer": async (page, lang, theme) => {
    await open(page, lang, theme, `&issue=${ISSUES.offer}`);
    await ready(page);
    await page.locator(".glossary summary").click();
    await page.getByTestId("working").locator("summary").click();
    await expect(page.locator(".working .stoa-table").first()).toBeVisible();
  },
  // A broker's fee out of range: the field's message, the yield block's
  // and the calculator's.
  "fee out of range": async (page, lang, theme) => {
    await open(page, lang, theme, `&issue=${ISSUES.offer}`);
    await ready(page);
    const fee = page.getByTestId("fee").locator("input");
    await fee.fill("2");
    await fee.press("Enter");
    await expect(page.getByTestId("fee").getByRole("alert")).toBeVisible();
    await expect(page.locator(".calculator").getByTestId("calc-error")).toBeVisible();
  },
  // The risks at their fullest: subordinated, qualified only, a
  // negative outlook, a thin market.
  "issue with every risk": async (page, lang, theme) => {
    await open(page, lang, theme, "&issue=BELB-02");
    await ready(page);
    await expect(page.getByTestId("liquidity-warning")).toBeVisible();
  },
  // Three issues compared, with the analogues and the map's table open.
  "comparison and analogues": async (page, lang, theme) => {
    await open(page, lang, theme, `&issue=BELB-02&cmp=${ISSUES.offer}&cmp=BELB-02&cmp=NEVB-01`);
    await ready(page);
    await page.getByTestId("analogues").locator(".stoa-chart__data summary").click();
    await expect(page.locator(".compare")).toBeVisible();
  },
  // Holdings with every kind of event, and the income by month.
  "holdings and events": async (page, lang, theme) => {
    await open(page, lang, theme, `&${PORTFOLIO}`);
    await ready(page);
    await expect(page.getByTestId("income").locator("tbody tr")).toHaveCount(12);
  },
  // The confirmation of a request to redeem at a put offer.
  "redemption request": async (page, lang, theme) => {
    await open(page, lang, theme, `&hold=${PORTFOLIO_PUT}*10`);
    await ready(page);
    await page.locator(".redeem").getByRole("button").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    // Scanned once the dialog has faded in: mid-fade its text is paler
    // than it is drawn.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  },
  // The ladder builder with three rungs, its figures and assumptions, and
  // the working of its tax open.
  ladder: async (page, lang, theme) => {
    await open(page, lang, theme, "&lh=3&la=1000000");
    await ready(page);
    await expect(page.getByTestId("rung")).toHaveCount(3);
    await page.getByTestId("ladder-tax").locator("summary").click();
    await expect(page.getByTestId("ladder-tax").locator(".stoa-table, .stoa-derivation").first()).toBeVisible();
  },
  // A floater with amortisation: scenarios and the coupon chart.
  floater,
  // A filter with no match beside the floater: the empty state.
  "empty list": async (page, lang, theme) => {
    await floater(page, lang, theme);
    await page.getByRole("searchbox").fill("zzzz");
    await expect(page.locator(".pane-list .stoa-empty-state")).toBeVisible();
  },
  // An engine error in the floater's calculator.
  "calculation error": async (page, lang, theme) => {
    await floater(page, lang, theme);
    const amount = page.locator(".calculator .stoa-number input").first();
    await amount.fill("0");
    await amount.press("Enter");
    await expect(page.getByTestId("calc-error")).toBeVisible();
  },
  // The diagnostics sheet, timed.
  diagnostics: async (page, lang, theme) => {
    await floater(page, lang, theme);
    await page.locator(".foot__actions button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").locator(".diagnostics > button").click();
    await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(4, TIMING_DONE);
  },
};

// The states checked at 375 px, by the query that opens each.
const PHONE_STATES: Record<string, string> = {
  list: "",
  "money by a date": "&by=2027-10",
  comparison: `&cmp=${ISSUES.offer}&cmp=BELB-02&cmp=${ISSUES.floater}`,
  issue: `&issue=${ISSUES.floater}`,
  holdings: `&${PORTFOLIO}`,
  ladder: "&lh=3&la=1000000",
};

for (const lang of LANGS) {
  for (const theme of THEMES) {
    for (const [state, prepare] of Object.entries(READY_STATES)) {
      test(`axe: ${state} (${lang}, ${theme})`, async ({ page }) => {
        await prepare(page, lang, theme);
        await expectNoSeriousViolations(page, state, { lang, theme });
      });
    }

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

    // On a phone, one test per state for the same reason.
    for (const [state, query] of Object.entries(PHONE_STATES)) {
      test(`axe and layout on a phone: ${state} (${lang}, ${theme})`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await open(page, lang, theme, query);
        await ready(page);
        await expectNoHorizontalScroll(page, `${state} at 375`);
        await expectNoSeriousViolations(page, `${state} on a phone`, { lang, theme });
      });
    }
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
