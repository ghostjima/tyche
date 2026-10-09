// Goal first: three goals at the top of the list set the filters below,
// which stay visible and can be changed; "Money by a date" takes a month;
// the professional filters sit under them; the whole state lives in the
// URL. In Russian first and in English.
import { expect, test, type Page } from "@playwright/test";
import { ready } from "./helpers";

const rows = (page: Page) => page.locator(".pane-list [role=option]");
const goal = (page: Page, name: RegExp) => page.getByRole("toolbar", { name: /^(Goal|Цель)$/ }).getByRole("button", { name });
const params = (page: Page) => new URL(page.url()).searchParams;

test("Instead of a deposit sets visible filters, says what it sets, and can be changed", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  const deposit = goal(page, /^Instead of a deposit \d+$/);
  await deposit.click();
  await expect(deposit).toHaveAttribute("aria-pressed", "true");
  // The goal's chips are the bar's own, pressed where anyone can see them.
  for (const chip of ["AAA to AA-", "Up to a year", "Fixed", "On the key rate", "Every investor", "Liquid"]) {
    await expect(page.getByRole("search").getByRole("button", { name: new RegExp(`^${chip} \\d+$`) }).first()).toHaveAttribute("aria-pressed", "true");
  }
  const note = page.locator(".goals__note");
  await expect(note).toContainText("Sets the filters: synthetic government bonds and issues rated AA- or higher");
  // The liquidity thresholds are named.
  await expect(note).toContainText("a quoted spread up to 0.5%");
  await expect(note).toContainText("10,000 bonds deep");
  const count = Number((await deposit.innerText()).match(/\d+$/)![0]);
  await expect(rows(page)).toHaveCount(count);
  expect(params(page).getAll("f")).toEqual(["durShort", "ratingHigh", "fixed", "keyRate", "open", "liquid"]);

  // Changing a chip keeps the others and turns the goal off.
  await page.getByRole("search").getByRole("button", { name: /^On the key rate \d+$/ }).click();
  await expect(deposit).toHaveAttribute("aria-pressed", "false");
  await expect(note).toHaveCount(0);
  await expect(page.getByRole("search").getByRole("button", { name: /^Fixed \d+$/ })).toHaveAttribute("aria-pressed", "true");
  // Pressing it again sets its filters again; pressing it once more clears them.
  await deposit.click();
  await expect(deposit).toHaveAttribute("aria-pressed", "true");
  await deposit.click();
  await expect(rows(page)).toHaveCount(188);
  expect(params(page).get("f")).toBeNull();
});

test("Monthly income asks for monthly coupons without an offer or amortisation", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await goal(page, /^Monthly income \d+$/).click();
  for (const chip of ["Monthly", "No offer", "None"]) {
    await expect(page.getByRole("search").getByRole("button", { name: new RegExp(`^${chip} \\d+$`) })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.locator(".goals__note")).toHaveText(
    "Sets the filters: a coupon every month, no offer and no amortisation, so each issue's maturity date is known in advance and the issues can be lined up into a ladder.",
  );
  await expect(rows(page)).toHaveCount(16);
});

test("Money by a date takes a month and a year, kept in the URL, and shows in the bar as a chip that turns it off", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await goal(page, /^Money by a date \d+$/).click();
  // A year after the valuation date by default.
  expect(params(page).get("by")).toBe("2027-10");
  await expect(page.getByRole("group", { name: "Money needed by the end of" })).toBeVisible();
  const before = await rows(page).count();
  await page.getByRole("group", { name: "Money needed by the end of" }).getByRole("button", { name: /Year/ }).click();
  await page.getByRole("option", { name: "2029" }).click();
  expect(params(page).get("by")).toBe("2029-10");
  await expect.poll(() => rows(page).count()).toBeGreaterThan(before);
  await page.getByRole("group", { name: "Money needed by the end of" }).getByRole("button", { name: /Month/ }).click();
  await page.getByRole("option", { name: "March" }).click();
  expect(params(page).get("by")).toBe("2029-03");
  // Every issue shown matures by then, or has a put offer by then.
  const chip = page.getByRole("search").getByRole("button", { name: /^Matures or put by Mar\s31,\s2029 \d+$/ });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  expect(params(page).get("by")).toBeNull();
  await expect(goal(page, /^Money by a date/)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("group", { name: "Money needed by the end of" })).toHaveCount(0);
});

test("the list's state comes back from a link: goal, chips, search, date and sort", async ({ page }) => {
  await page.goto("/?lang=en&f=monthly&f=noOffer&f=noAmortisation&sort=maturity");
  await ready(page);
  await expect(goal(page, /^Monthly income/)).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(16);
  await expect(page.getByRole("button", { name: /Sort by/ })).toContainText("Maturity, soonest first");
  await page.goto("/?lang=en&by=2027-03&q=kama&f=nonsense");
  await ready(page);
  await expect(goal(page, /^Money by a date/)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox", { name: "Search by issuer or ticker" })).toHaveValue("kama");
  expect(params(page).get("f")).toBeNull();
  // A goal keeps the search; Clear all clears everything, the date too.
  await goal(page, /^Instead of a deposit/).click();
  await expect(page.getByRole("searchbox", { name: "Search by issuer or ticker" })).toHaveValue("kama");
  expect(params(page).get("by")).toBeNull();
  await page.getByRole("button", { name: "Clear all" }).first().click();
  expect(params(page).toString()).toBe("lang=en");
});

test("who can buy has the gate's three states, in the issue card's words, with counts, kept in the link", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  const total = await rows(page).count();
  const group = page.getByRole("search").getByRole("toolbar", { name: "Who can buy", exact: true });
  const chips = group.getByRole("button");
  await expect(chips).toHaveText([/^Every investor\s*\d+$/, /^Test required\s*\d+$/, /^Qualified investors only\s*\d+$/]);
  // Each issue is in exactly one state: the counts add up to the list.
  const counts = (await chips.allInnerTexts()).map((text) => Number(text.match(/\d+$/)![0]));
  expect(counts.every((n) => n > 0)).toBe(true);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
  // "Test required" keeps its count of issues, and says it in the link.
  await chips.nth(1).click();
  await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(counts[1]!);
  expect(params(page).getAll("f")).toEqual(["test"]);
  // The card of an issue it keeps says the same.
  await rows(page).first().click();
  const access = page.getByTestId("risks").locator(".stoa-description-list__item").filter({ has: page.getByRole("term").filter({ hasText: "Who can buy" }) });
  await expect(access.locator(".stoa-tag")).toHaveText("Test required");
  // The link brings the chip back; with qualified investors only, the list widens.
  await page.goto("/?lang=en&f=test&f=qualified");
  await ready(page);
  await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(chips.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(counts[1]! + counts[2]!);
  await chips.nth(2).click();
  await expect(rows(page).first()).toBeVisible();
  await rows(page).first().click();
  await expect(access.locator(".stoa-tag")).toHaveText("Test required");
  // In Russian, the card's words too.
  await page.goto("/?lang=ru&f=qualified");
  await ready(page);
  const ru = page.getByRole("search").getByRole("toolbar", { name: "Кто может купить", exact: true }).getByRole("button");
  for (const [n, name] of ["Все инвесторы", "Нужен тест", "Только для квалифицированных инвесторов"].entries()) {
    await expect(ru.nth(n)).toHaveAccessibleName(new RegExp(`^${name} \\d+$`));
  }
  await expect(ru.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(counts[2]!);
});

test("in Russian: the goals, the sentence and the professional filters, and still no advice", async ({ page }) => {
  await page.goto("/?lang=ru");
  await ready(page);
  await expect(page.getByRole("toolbar", { name: "Цель" }).getByRole("button")).toHaveText([/^Вместо вклада/, /^Ежемесячный доход/, /^Деньги к дате/]);
  await goal(page, /^Вместо вклада/).click();
  await expect(page.locator(".goals__note")).toContainText("Ставит фильтры: синтетические государственные облигации");
  await expect(page.locator(".goals__note")).toContainText("спред котировок до 0,5 %");
  for (const group of [
    "Доходность к оферте или погашению",
    "Дюрация",
    "Синтетический рейтинг",
    "Купон",
    "Выплата купона",
    "Оферта",
    "Амортизация",
    "Кто может купить",
    "Ликвидность",
  ]) {
    await expect(page.getByRole("search").getByRole("toolbar", { name: group, exact: true })).toBeVisible();
  }
  // The goals describe filters; the banner keeps saying it is not advice.
  await expect(page.locator(".goals")).not.toContainText(/рекоменд|совет|лучш|выгодн/i);
  await expect(page.getByRole("banner")).toContainText("Не является инвестиционной рекомендацией.");
  await goal(page, /^Деньги к дате/).click();
  await expect(page.getByRole("group", { name: "Деньги нужны к концу месяца" }).getByRole("button", { name: /Месяц/ })).toContainText("октябрь");
});

test("on a phone the goals stay in view over the filters' sheet, without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=ru");
  await ready(page);
  await goal(page, /^Деньги к дате/).click();
  await expect(page.getByRole("group", { name: "Деньги нужны к концу месяца" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  await expect(page.getByRole("button", { name: /^Фильтры/ })).toContainText("1");
});
