// The holdings' events on a calendar, switchable with the list by date:
// Stoa's EventCalendar with the coupons, amortisations, maturities, put
// offers on the first day of their window, their deadline and their date,
// call offers, and the synthetic scenario's rating changes and defaults,
// marked as synthetic. A month grid on a wide screen, a list of days on a
// phone.
import { expect, test, type Page } from "@playwright/test";
import { PORTFOLIO, PORTFOLIO_PUT, expectNoHorizontalScroll, ready } from "./helpers";

const panel = (page: Page) => page.getByRole("region", { name: /^(Holdings and events|Портфель и события)$/ });
const inbox = (page: Page) => panel(page).getByTestId("inbox");

async function openCalendar(page: Page, lang: "en" | "ru" = "en", query = PORTFOLIO) {
  await page.goto(`/?lang=${lang}&${query}`);
  await ready(page);
  await inbox(page).getByRole("radio", { name: lang === "en" ? "On a calendar" : "В календаре" }).click();
}

test("the events switch to a month grid that opens on today's month, with the next event's day chosen", async ({ page }) => {
  await openCalendar(page);
  const box = inbox(page);
  await expect(box.getByRole("radio", { name: "On a calendar" })).toHaveAttribute("aria-checked", "true");
  await expect(box.locator(".stoa-timeline")).toHaveCount(0);
  const grid = box.getByRole("grid", { name: "Events of the holdings on a calendar October 2026" });
  await expect(grid).toBeVisible();
  // Today is the valuation date.
  await expect(grid.locator('[data-date="2026-10-05"]')).toHaveAttribute("aria-current", "date");
  // The next day with an event is chosen, and its events listed under the grid.
  await expect(grid.locator('[data-date="2026-10-12"]')).toHaveAttribute("aria-selected", "true");
  await expect(grid.locator('[data-date="2026-10-12"]')).toContainText("Monday, October 12, 2026: Coupon");
  const chosen = box.locator(".stoa-calendar__chosen");
  await expect(chosen.getByRole("heading", { level: 5 })).toHaveText("Monday, October 12, 2026");
  await expect(chosen.locator(".stoa-calendar__event")).toHaveText([/^●Coupon · : VTKT-02: ₽166\.03 for the holding, ₽16\.60 a bond$/]);
  // Each kind is a symbol and a word in the key.
  await expect(box.locator(".stoa-calendar__key-item")).toHaveText(["●Coupon", "◐Amortisation", "◆Offer", "■Maturity", "↕Rating change", "✗Default"]);
  // Back to the list.
  await box.getByRole("radio", { name: "By date" }).click();
  await expect(box.getByRole("list", { name: "Events of the holdings by date" })).toBeVisible();
});

test("a put offer is on the calendar on its window's first day, its deadline and its date, and the request is made on the deadline", async ({ page }) => {
  await openCalendar(page);
  const box = inbox(page);
  await box.getByRole("button", { name: "Next month: November 2026" }).click();
  await box.getByRole("button", { name: "Next month: December 2026" }).click();
  const grid = box.getByRole("grid", { name: "Events of the holdings on a calendar December 2026" });
  await expect(grid.locator('[data-date="2026-12-02"]')).toContainText(": Offer");
  await grid.locator('[data-date="2026-12-02"]').click();
  const chosen = box.locator(".stoa-calendar__chosen");
  await expect(chosen).toContainText(`${PORTFOLIO_PUT}: the window to request redemption at the put offer opens; the deadline is Dec 8, 2026`);
  await grid.locator('[data-date="2026-12-11"]').click();
  await expect(chosen).toContainText(`${PORTFOLIO_PUT}: put offer; the issuer buys back the bonds whose redemption was requested, ₽10,000.00 for the holding`);
  await expect(chosen.locator(".stoa-calendar__event")).toHaveCount(2);
  // The deadline: the countdown in working days, the rule, and the request.
  await grid.locator('[data-date="2026-12-08"]').click();
  await expect(chosen).toContainText(`${PORTFOLIO_PUT}: the last day to request redemption at the put offer of Dec 11, 2026`);
  await expect(chosen.locator(".stoa-countdown")).toHaveText(/working days left$/);
  await expect(chosen).toContainText("How the window works");
  await chosen.getByRole("button", { name: "Request redemption at the offer" }).click();
  const dialog = page.getByRole("alertdialog", { name: `Request redemption of ${PORTFOLIO_PUT} at the offer?` });
  await expect(dialog).toContainText("sends nothing to a broker or the issuer and places no order");
  await dialog.getByRole("button", { name: "Record the request" }).click();
  await expect(chosen.getByRole("button", { name: "Cancel the request" })).toBeFocused();
  await expect(chosen.getByRole("button", { name: "Cancel the request" })).toHaveAccessibleDescription(/^Request recorded in this browser, bonds: 10;/);
  // The list by date shows the same request.
  await box.getByRole("radio", { name: "By date" }).click();
  await expect(box.getByRole("button", { name: "Cancel the request" })).toHaveAccessibleDescription(/^Request recorded in this browser, bonds: 10;/);
});

test("a request recorded from the list is on the calendar's deadline, and cancelled there", async ({ page }) => {
  await page.goto(`/?lang=en&${PORTFOLIO}`);
  await ready(page);
  const box = inbox(page);
  const offer = box.locator(".stoa-timeline__entry").filter({ hasText: "Put offer" }).filter({ hasText: PORTFOLIO_PUT });
  await offer.getByRole("button", { name: "Request redemption at the offer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Record the request" }).click();
  await expect(offer.getByRole("button", { name: "Cancel the request" })).toBeFocused();
  await box.getByRole("radio", { name: "On a calendar" }).click();
  await box.getByRole("button", { name: "Next month: November 2026" }).click();
  await box.getByRole("button", { name: "Next month: December 2026" }).click();
  await box.getByRole("grid").locator('[data-date="2026-12-08"]').click();
  const chosen = box.locator(".stoa-calendar__chosen");
  const cancel = chosen.getByRole("button", { name: "Cancel the request" });
  await expect(cancel).toHaveAccessibleDescription(/^Request recorded in this browser, bonds: 10;/);
  await cancel.click();
  await expect(chosen.getByRole("button", { name: "Request redemption at the offer" })).toBeFocused();
  await box.getByRole("radio", { name: "By date" }).click();
  await expect(offer.getByRole("button", { name: "Request redemption at the offer" })).toBeVisible();
});

test("the scenario's rating changes and defaults, the future ones included, are on the calendar and marked as synthetic", async ({ page }) => {
  await openCalendar(page);
  const box = inbox(page);
  const grid = box.getByRole("grid");
  // Back to August 2026: a past rating change.
  await grid.locator('[data-date="2026-10-05"]').focus();
  await page.keyboard.press("PageUp");
  await page.keyboard.press("PageUp");
  await expect(box.getByRole("heading", { level: 4, name: "August 2026" })).toBeVisible();
  await grid.locator('[data-date="2026-08-05"]').click();
  const chosen = box.locator(".stoa-calendar__chosen");
  await expect(chosen).toContainText(`${PORTFOLIO_PUT}: the fictional agency moves the synthetic rating from BBB to BBB-`);
  await expect(chosen).toContainText("Synthetic scenario: nothing here happened to a real issuer.");
  // A year ahead: a missed payment and the default it ends in.
  await grid.locator('[data-date="2026-08-05"]').focus();
  await page.keyboard.press("Shift+PageDown");
  await expect(box.getByRole("heading", { level: 4, name: "August 2027" })).toBeVisible();
  await grid.locator('[data-date="2027-08-20"]').click();
  await expect(chosen).toContainText("BELM-01: the ₽5,501.62 due is not paid on the day (a technical default)");
  await expect(chosen).toContainText("Synthetic scenario");
  await page.keyboard.press("PageDown");
  await expect(box.getByRole("heading", { level: 4, name: "September 2027" })).toBeVisible();
  await grid.locator('[data-date="2027-09-03"]').click();
  await expect(chosen.locator(".stoa-calendar__kind")).toHaveText(["Default"]);
  await expect(chosen).toContainText("BELM-01: the grace period ends without the payment, and the issue is in default");
  await expect(chosen).toContainText("Synthetic scenario");
});

test("the grid is one tab stop whose arrow keys walk the days and Enter chooses one", async ({ page }) => {
  await openCalendar(page);
  const box = inbox(page);
  // From the view switch, Tab reaches the month's buttons, then the grid on
  // the chosen day.
  await box.getByRole("radio", { name: "On a calendar" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const grid = box.getByRole("grid");
  await expect(grid.locator('[data-date="2026-10-12"]')).toBeFocused();
  await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(grid.locator('[data-date="2026-10-21"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(grid.locator('[data-date="2026-10-21"]')).toHaveAttribute("aria-selected", "true");
  await expect(box.locator(".stoa-calendar__chosen .stoa-calendar__kind")).toHaveText(["Coupon", "Amortisation"]);
});

test("on a phone the calendar is a list of the month's days, in Russian, with nothing scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openCalendar(page, "ru");
  const box = inbox(page);
  await expect(box.getByRole("grid")).toHaveCount(0);
  const days = box.locator(".stoa-calendar__day-group");
  await expect(days.first()).toContainText("Понедельник, 12 октября 2026 г.");
  await expect(days.first()).toContainText(`${PORTFOLIO_PUT}: 166,03\u00a0₽ по портфелю, 16,60\u00a0₽ на облигацию`);
  await box.getByRole("button", { name: /^Следующий месяц/ }).click();
  await box.getByRole("button", { name: /^Следующий месяц/ }).click();
  await expect(box.locator(".stoa-calendar__month")).toHaveText("Декабрь 2026 г.");
  await expect(box).toContainText(`${PORTFOLIO_PUT}: последний день подать заявку на выкуп по оферте`);
  await expectNoHorizontalScroll(page, "calendar at 375");
});
