// Shared steps for the end-to-end tests.
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Fails with the rule ids and node counts of every serious or critical
 * axe violation on the page as it is now. `scan`, when given, names the
 * language and theme scanned; with `what` as the state, it is recorded as
 * an annotation that scripts/badges.mjs reads to state the axe matrix. */
export async function expectNoSeriousViolations(page: Page, what = "", scan?: { lang: string; theme: string }) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`), what).toEqual([]);
  if (scan) test.info().annotations.push({ type: "axe-scan", description: JSON.stringify({ ...scan, state: what }) });
}

/** Waits until the engines are settled and the list is drawn. */
export async function ready(page: Page, engine: "wasm" | "twin" = "wasm") {
  await expect(page.locator(".app")).toHaveAttribute("data-state", "ready");
  await expect(page.locator(".app")).toHaveAttribute("data-engine", engine);
}

/** The document never scrolls sideways. */
export async function expectNoHorizontalScroll(page: Page, what = "") {
  const overflow = await page.evaluate(() => {
    const scroller = document.querySelector(".stoa-page-shell__scroll");
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      region: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
    };
  });
  expect(overflow, what).toEqual({ doc: 0, region: 0 });
}

/** Issues of the synthetic universe with the features the screen shows. */
export const ISSUES = {
  /** Corporate, fixed coupon, with a put offer. */
  offer: "KAMF-01",
  /** Corporate floater on RUONIA, amortising. */
  floater: "LADE-02",
  /** Corporate, fixed, amortising, no offer. */
  amortising: "ILML-03",
  /** Plain fixed synthetic government bond, over three years. */
  gov: "SG-143",
} as const;
