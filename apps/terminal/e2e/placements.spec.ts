// Placements by book-building: opened beside the list and kept in the
// link, a card per placement with its book's window and a countdown in
// working days, the coupon guidance, the final coupon once the book has
// closed and what an indicative request was allotted, and the rules of
// the synthetic universe that set them.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, ready } from "./helpers";

const panel = (page: Page) => page.getByRole("region", { name: /^(Placements|Размещения)$/ });
const card = (page: Page, ticker: string) => panel(page).getByTestId("placement").filter({ hasText: ticker });

test("the placements open beside the list, a card each, and close back to their button", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Placements", exact: true }).click();
  const p = panel(page);
  await expect(p.getByRole("button", { name: "Close the placements" })).toBeFocused();
  expect(new URL(page.url()).searchParams.get("pl")).toBe("1");
  // Its sources: the synthetic universe, and the Bank of Russia's curve the
  // guidance is priced from.
  await expect(p.locator("[data-source]").locator(".stoa-tag")).toHaveText(["SIM", "Bank of Russia"]);
  await expect(p).toContainText("A synthetic scenario: no real placement, and nothing here can be requested.");
  // By the book's first day: one closed, two open, one to come.
  await expect(p.getByTestId("placement")).toHaveCount(4);
  expect(await p.getByTestId("placement").evaluateAll((cards) => cards.map((c) => c.getAttribute("data-state")))).toEqual(["closed", "open", "open", "upcoming"]);

  const closed = card(page, "AMRB-02");
  await expect(closed.getByRole("heading", { level: 3 })).toContainText("AMRB-02");
  await expect(closed.locator(".stoa-tag")).toHaveText("Book closed");
  await expect(closed).toContainText("Requests from Sep 24, 2026 to Sep 29, 2026");
  await expect(closed.locator(".stoa-countdown")).toHaveCount(0);
  await expect(closed).toContainText("17.90% to 18.55% a year, paid monthly");
  await expect(closed.getByRole("definition").filter({ hasText: "18.05%" })).toContainText("Requests came to 2.17 times the size");
  await expect(closed).toContainText("A request of ₽1,000,000 at face value without a coupon limit got ₽461,000, 46.1% of it, pro rata to the demand (synthetic scenario).");

  const open = card(page, "TAVE-04");
  await expect(open.locator(".stoa-tag")).toHaveText("Book open");
  await expect(open.locator(".stoa-countdown")).toHaveText("Working days to the close: 5");
  await expect(open.locator(".stoa-countdown")).toHaveAttribute("data-state", "normal");
  await expect(open).toContainText("Set when the book closes on Oct 12, 2026");
  await expect(open).toContainText("Known when the book closes: requests are allotted pro rata to the demand.");
  // A book that closes tomorrow is drawn as close.
  await expect(card(page, "OKAT-02").locator(".stoa-countdown")).toHaveAttribute("data-state", "warning");
  await expect(card(page, "LADE-03").locator(".stoa-tag")).toHaveText("Book opens soon");
  await expect(card(page, "LADE-03").locator(".stoa-countdown")).toHaveText("Working days to the opening: 13");

  await expect(p.getByRole("heading", { name: "How the synthetic books work" })).toBeVisible();
  await expect(p.locator(".placements__rules li")).toHaveCount(4);
  await expect(p.locator(".placements__rules")).toContainText("at the bottom from 2.5 times the size");

  await p.getByRole("button", { name: "Close the placements" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Placements", exact: true })).toBeFocused();
  expect(new URL(page.url()).searchParams.get("pl")).toBeNull();
});

test("a link with ?pl=1 opens the placements, in Russian, and on a phone nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=ru&pl=1");
  await ready(page);
  const p = panel(page);
  await expect(p.getByRole("heading", { level: 2 })).toHaveText("Размещения");
  await expect(card(page, "TAVE-04").locator(".stoa-tag")).toHaveText("Книга открыта");
  await expect(card(page, "TAVE-04").locator(".stoa-countdown")).toHaveText("Рабочих дней до закрытия: 5");
  await expect(card(page, "AMRB-02")).toContainText("Финальный купон");
  await expectNoHorizontalScroll(page, "placements at 375");
});
