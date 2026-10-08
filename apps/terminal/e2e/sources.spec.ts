// Honest sourcing: the demo banner on every screen, a source label on
// every widget (SIM for the synthetic universe, the Bank of Russia with
// its date and a link to cbr.ru), and the data and licensing page, by
// pointer and by keyboard.
import { expect, test, type Page } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

const BANNER = {
  ru: "Демонстрация. Данные синтетические. Не является инвестиционной рекомендацией.",
  en: "Demonstration. The data are synthetic. Not investment advice.",
} as const;

/** Every widget (a Stoa panel) on the terminal, by its heading, with the
 * source labels it carries. */
async function widgets(page: Page) {
  return page.locator(".app .stoa-panel").evaluateAll((panels) =>
    panels.map((p) => ({
      title: p.querySelector(".stoa-panel__title")?.textContent ?? "",
      sources: [...p.querySelectorAll(":scope > .stoa-source-note")].map((n) => n.getAttribute("data-source")),
    })),
  );
}

for (const lang of ["ru", "en"] as const) {
  test(`the demo banner stays in the header on every screen (${lang})`, async ({ page }) => {
    for (const query of ["", `&issue=${ISSUES.offer}`, "&page=data"]) {
      await page.goto(`/?lang=${lang}${query}`);
      await ready(page);
      const banner = page.getByRole("banner");
      await expect(banner).toContainText(BANNER[lang]);
    }
    // It stays in view while the page scrolls.
    await page.goto(`/?lang=${lang}&issue=${ISSUES.floater}`);
    await ready(page);
    await page.locator(".stoa-page-shell__scroll").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(page.getByText(BANNER[lang])).toBeInViewport();
  });
}

test("every widget names its source: SIM for the universe, the Bank of Russia with its date and a link", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.floater}`);
  await ready(page);
  const all = await widgets(page);
  expect(all.map((w) => w.title)).toEqual(["Issues", "Ladoga Generation", "Order ticket", "Calculator", "Bank of Russia benchmarks"]);
  for (const w of all) expect(w.sources.length, w.title).toBeGreaterThan(0);
  expect(all.find((w) => w.title === "Issues")!.sources).toEqual(["sim"]);
  expect(all.find((w) => w.title === "Order ticket")!.sources).toEqual(["sim"]);
  expect(all.find((w) => w.title === "Calculator")!.sources).toEqual(["sim", "official"]);
  expect(all.find((w) => w.title === "Bank of Russia benchmarks")!.sources).toEqual(["official"]);

  const sim = page.locator(".pane-list .stoa-source-note");
  await expect(sim.locator(".stoa-tag")).toHaveText("SIM");
  // Stoa's SourceNote: "Source:" is read before the tag, not drawn.
  await expect(sim).toContainText(/^Source: SIM /);
  await expect(sim.getByText("Source:")).toHaveClass(/stoa-visually-hidden/);
  await expect(sim).toContainText("Synthetic data");
  const bank = page.locator(".benchmarks .stoa-source-note");
  await expect(bank.locator(".stoa-tag")).toHaveText("Bank of Russia");
  await expect(bank).toContainText("Figures as of Oct 5, 2026");
  await expect(bank.getByRole("link", { name: "cbr.ru" })).toHaveAttribute("href", "https://www.cbr.ru/");
  await expect(bank.getByRole("link", { name: "moex.com" })).toHaveAttribute("href", "https://www.moex.com/a3642");
  await expect(page.locator(".calculator .stoa-source-note").getByRole("link", { name: "cbr.ru" })).toHaveAttribute("href", "https://www.cbr.ru/");
  // The benchmarks show the snapshot's figures and the curve.
  const benchmarks = page.getByRole("region", { name: "Bank of Russia benchmarks" });
  await expect(benchmarks).toContainText("Key rate");
  await expect(benchmarks).toContainText("14.00%");
  await expect(benchmarks).toContainText("RUONIA for Oct 5, 2026");
  await expect(benchmarks).toContainText("August 2026");
  await expect(benchmarks.getByRole("figure", { name: "Zero-coupon yield curve of federal loan bonds" })).toBeVisible();
});

test("on a phone the list and the issue carry their labels too", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=ru");
  await ready(page);
  for (const w of await widgets(page)) expect(w.sources.length, w.title).toBeGreaterThan(0);
  await page.goto(`/?lang=ru&issue=${ISSUES.gov}`);
  await ready(page);
  const all = await widgets(page);
  // The list gives way to the issue: its card, its order ticket, the
  // calculator and the benchmarks.
  expect(all.length).toBe(4);
  for (const w of all) expect(w.sources.length, w.title).toBeGreaterThan(0);
});

test("the data page opens from a source label by keyboard, is a region of the main landmark with headings, and Back returns the focus", async ({ page }) => {
  await page.goto("/?lang=en&theme=light");
  await ready(page);
  const link = page.locator(".pane-list .stoa-source-note").getByRole("link", { name: "Data and licensing" });
  await link.focus();
  await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { level: 2, name: "Data and licensing" });
  await expect(heading).toBeFocused();
  expect(new URL(page.url()).searchParams.get("page")).toBe("data");
  expect(new URL(page.url()).searchParams.get("theme")).toBe("light");
  const region = page.getByRole("main").getByRole("region", { name: "Data and licensing" });
  await expect(region).toBeVisible();
  await expect(region.getByRole("heading", { level: 3 })).toHaveText([
    "The synthetic universe (SIM)",
    "Bank of Russia",
    "Moscow Exchange",
    "Not used",
    "Tax rules",
    "Code and fonts",
  ]);
  await expect(region).toContainText("188 fictional issues of 73 fictional issuers");
  await expect(region).toContainText("articles 214.1, 219.1, 224");
  await expect(region).toContainText("АКРА, Эксперт РА");
  await expect(region.getByRole("link", { name: "cbr.ru/user_agreement" })).toHaveAttribute("href", "https://www.cbr.ru/user_agreement/");
  await expect(region.getByRole("link", { name: "moex.com" })).toHaveAttribute("href", "https://www.moex.com/a3642");
  // The terminal's widgets are not on the page.
  await expect(page.locator(".pane-list")).toHaveCount(0);

  await region.getByRole("button", { name: "Back to the terminal" }).click();
  await expect(page.locator(".pane-list")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect(page.locator(".pane-list .stoa-source-note").getByRole("link", { name: "Data and licensing" })).toBeFocused();
  // It went back in the history: Forward opens the page again, with the
  // focus on its heading, and Back returns it to the foot's link, since no
  // label opened the page this time.
  await page.goForward();
  await expect(heading).toBeFocused();
  await page.goBack();
  await expect(page.locator(".pane-list")).toBeVisible();
  await expect(page.locator(".foot").getByRole("link", { name: "Data and licensing" })).toBeFocused();
});

test("on a phone the issue card's label opens the data page, and Back returns the focus to that label in the card", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  const label = page.locator(".issue-card .stoa-source-note").getByRole("link", { name: "Data and licensing" });
  await label.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Data and licensing" })).toBeFocused();
  await page.getByRole("button", { name: "Back to the terminal" }).click();
  // The card comes back from the history's entry, with the issue in it.
  await expect(page.locator(".issue-card")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("issue")).toBe(ISSUES.offer);
  await expect(label).toBeFocused();
});

test("the search shortcut pressed while the engines load puts the focus in the search once the list is drawn", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/*.wasm", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/?lang=en");
  await expect(page.locator(".app")).toHaveAttribute("data-state", "loading");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.keyboard.press("/");
  // Many frames go by before the engines answer.
  await page.waitForTimeout(500);
  release();
  await ready(page);
  await expect(page.getByLabel("Search by issuer or ticker")).toBeFocused();
});

test("the foot's link opens the data page, and the search shortcut leaves it for the search", async ({ page }) => {
  await page.goto(`/?lang=ru&issue=${ISSUES.offer}`);
  await ready(page);
  await page.locator(".foot").getByRole("link", { name: "Данные и лицензии" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Данные и лицензии" })).toBeFocused();
  expect(new URL(page.url()).searchParams.get("issue")).toBeNull();
  await page.keyboard.press("/");
  await expect(page.getByLabel("Поиск по эмитенту или тикеру")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("page")).toBeNull();
});

test("a link to the data page opens it, with the page's start untouched", async ({ page }) => {
  await page.goto("/?lang=ru&page=data");
  await ready(page);
  await expect(page.getByRole("heading", { level: 2, name: "Данные и лицензии" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Данные и лицензии" })).not.toBeFocused();
  await expect(page.getByRole("main")).toContainText("188 вымышленных выпусков");
  await page.getByRole("button", { name: "Назад к терминалу" }).click();
  await expect(page.locator(".pane-list")).toBeVisible();
  // Nothing to go back to: the focus goes to the foot's link, not the page.
  await expect(page.locator(".foot").getByRole("link", { name: "Данные и лицензии" })).toBeFocused();
});

test("the labels and the benchmarks keep their height when the web fonts arrive", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\.woff2$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/?lang=ru", { waitUntil: "commit" });
  await ready(page);
  const heights = () =>
    page.evaluate(() => [".pane-list .stoa-source-note", ".benchmarks"].map((s) => document.querySelector(s)!.getBoundingClientRect().height));
  const before = await heights();
  release();
  await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes("IBM Plex Sans") && f.status === "loaded"));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  expect(await heights()).toEqual(before);
});
