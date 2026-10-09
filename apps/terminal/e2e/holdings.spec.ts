// Holdings and events: a synthetic portfolio in the URL or added from the
// issue card, the events of the holdings by date (payments from the
// terms, offers with their window and deadline, the scenario's rating
// changes and defaults), a request to redeem at a put offer recorded in
// this browser only, and the coupon income by month. In English and in
// Russian, at 1280 and 375 px.
import { expect, test, type Page } from "@playwright/test";
import { PORTFOLIO, PORTFOLIO_PUT, expectNoHorizontalScroll, ready } from "./helpers";

/** A put offer whose window is ahead (2 to 8 December 2026), monthly
 * coupons, a past rating change. */
const PUT = PORTFOLIO_PUT;

const panel = (page: Page) => page.getByRole("region", { name: /^(Holdings and events|Портфель и события)$/ });
const holdings = (page: Page) => new URL(page.url()).searchParams.getAll("hold");
const entry = (page: Page, kind: string, id: string) => panel(page).locator(".stoa-timeline__entry").filter({ hasText: kind }).filter({ hasText: id });

test("holdings from the link: the issues held, the events by date with their sources, and the income by month", async ({ page }) => {
  await page.goto(`/?lang=en&${PORTFOLIO}`);
  await ready(page);
  const p = panel(page);
  await expect(p.getByRole("heading", { level: 2 })).toHaveText("Holdings and events");
  // Its source: the synthetic universe, with what is scenario said.
  await expect(p.locator("[data-source]").locator(".stoa-tag")).toHaveText("SIM");
  await expect(p).toContainText("rating changes and defaults are the synthetic universe's scenario");
  const held = p.getByRole("table", { name: "Issues held" });
  await expect(held.locator("tbody tr")).toHaveCount(6);
  // The remove column has a header for assistive technology only.
  await expect(held.getByRole("columnheader")).toHaveText(["Issue", "Bonds", "Face value", "Remove from the holdings"]);
  await expect(held.getByRole("columnheader").last().locator(".stoa-visually-hidden")).toHaveText("Remove from the holdings");
  await expect(held.locator("tbody tr").first()).toContainText(PUT);
  await expect(held.locator("tbody tr").first()).toContainText("₽10,000");

  // The events by date, oldest first, the days as headings.
  const inbox = p.getByRole("list", { name: "Events of the holdings by date" });
  await expect(inbox).toBeVisible();
  const days = await inbox.locator(".stoa-timeline__date time").evaluateAll((ts) => ts.map((t) => t.getAttribute("datetime")!));
  expect(days.length).toBeGreaterThan(20);
  expect([...days].sort()).toEqual(days);
  for (const kind of ["Coupon", "Amortisation", "Maturity", "Put offer", "Rating change", "Payment missed", "Missed payment made", "Default"]) {
    await expect(inbox.locator(".stoa-timeline__kind").filter({ hasText: new RegExp(`^${kind}$`) }).first(), kind).toBeVisible();
  }
  // A floater's coupon is projected; the scenario's events say they are one.
  await expect(entry(page, "Coupon", "OBRC-01").first()).toContainText("Projected at today's index");
  await expect(entry(page, "Default", "BELM-01").last()).toContainText("the issue is in default");
  await expect(entry(page, "Rating change", PUT)).toContainText("from BBB to BBB-. Synthetic scenario.");
  // A put offer: the window, its deadline counted down in working days, and the rule.
  const offer = entry(page, "Put offer", PUT);
  await expect(offer).toContainText("Requests are taken from Dec 2, 2026 to Dec 8, 2026");
  await expect(offer.locator(".stoa-countdown")).toHaveText(/working days left$/);
  await expect(offer).toContainText("How the window works");
  await expect(offer).toHaveClass(/stoa-timeline__entry--emphasis/);

  // Coupon income by month: twelve months from October 2026, before tax.
  const income = p.getByTestId("income");
  await expect(income.getByRole("table", { name: "Coupons and principal returned by month" }).locator("tbody tr")).toHaveCount(12);
  await expect(income.locator("tbody tr").first()).toContainText("October 2026");
  await expect(income.getByRole("term")).toHaveText(["Coupons over twelve months", "A month on average", "Months without a coupon"]);
  await expect(income).toContainText("before tax");
});

test("a request to redeem at a put offer is confirmed, recorded in this browser only, and cancelled", async ({ page }) => {
  await page.goto(`/?lang=en&hold=${PUT}*10`);
  await ready(page);
  const offer = entry(page, "Put offer", PUT);
  // The deadline line describes the request button.
  await expect(offer.getByRole("button", { name: "Request redemption at the offer" })).toHaveAccessibleDescription(/^Deadline: Dec\s8,\s2026\s\d+\sworking days left$/);
  await offer.getByRole("button", { name: "Request redemption at the offer" }).click();
  const dialog = page.getByRole("alertdialog", { name: `Request redemption of ${PUT} at the offer?` });
  await expect(dialog).toContainText("sends nothing to a broker or the issuer and places no order");
  // The safe action has the focus; declining records nothing.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(offer.getByRole("button", { name: "Request redemption at the offer" })).toBeFocused();
  await offer.getByRole("button", { name: "Request redemption at the offer" }).click();
  await dialog.getByRole("button", { name: "Record the request" }).click();
  // What was recorded stands beside Cancel, which takes the focus and is
  // described by it and by the deadline.
  const cancel = offer.getByRole("button", { name: "Cancel the request" });
  await expect(cancel).toBeFocused();
  await expect(cancel).toHaveAccessibleDescription(
    /^Request recorded in this browser, bonds: 10; it can be cancelled until Dec\s8,\s2026\. Not an order: nothing was sent\. Deadline: Dec\s8,\s2026\s\d+\sworking days left$/,
  );
  // Recorded, the entry no longer asks to act.
  await expect(offer).not.toHaveClass(/stoa-timeline__entry--emphasis/);
  // It is kept in this browser, not in the link.
  expect(new URL(page.url()).search).toBe(`?lang=en&hold=${PUT}*10`);
  await page.reload();
  await ready(page);
  await expect(offer.getByRole("button", { name: "Cancel the request" })).toHaveAccessibleDescription(/^Request recorded in this browser, bonds: 10/);
  await offer.getByRole("button", { name: "Cancel the request" }).click();
  await expect(offer.getByRole("button", { name: "Request redemption at the offer" })).toBeFocused();
  await expect(offer).not.toContainText("Request recorded in this browser");
});

test("an issue joins the holdings from its card, its bonds can be changed, and it leaves from the holdings", async ({ page }) => {
  await page.goto("/?lang=en&issue=SG-143");
  await ready(page);
  await expect(panel(page)).toHaveCount(0);
  const hold = page.getByTestId("hold");
  const field = hold.getByLabel("Bonds to hold");
  await field.fill("7");
  await field.press("Enter");
  await hold.getByRole("button", { name: "Add to the holdings" }).click();
  expect(holdings(page)).toEqual(["SG-143*7"]);
  await expect(hold.getByRole("status")).toHaveText("Bonds in the holdings: 7.");
  await expect(hold.getByRole("button", { name: "Update the holdings" })).toBeFocused();
  await expect(panel(page).getByRole("table", { name: "Issues held" }).locator("tbody tr")).toHaveCount(1);
  await field.fill("12");
  await field.press("Enter");
  await hold.getByRole("button", { name: "Update the holdings" }).click();
  expect(holdings(page)).toEqual(["SG-143*12"]);
  // A number of bonds that is not whole is said, and cannot be added.
  await field.fill("2.5");
  await field.press("Enter");
  await expect(hold).toContainText("Enter a whole number of bonds from one to");
  await expect(hold.getByRole("button", { name: "Update the holdings" })).toBeDisabled();
  // Taken out from the holdings, the panel goes and the focus does not fall to the page.
  await panel(page).getByRole("button", { name: "Remove SG-143" }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(holdings(page)).toEqual([]);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test("a link's holdings that are not issues of the universe, or not whole bonds, leave it", async ({ page }) => {
  await page.goto(`/?lang=en&hold=${PUT}*10&hold=NOPE-01*5&hold=KAMF-01*0`);
  await ready(page);
  await expect(panel(page).getByRole("table", { name: "Issues held" }).locator("tbody tr")).toHaveCount(1);
  await expect.poll(() => holdings(page)).toEqual([`${PUT}*10`]);
});

test("по-русски: портфель, события и купонный доход", async ({ page }) => {
  await page.goto(`/?lang=ru&${PORTFOLIO}`);
  await ready(page);
  const p = panel(page);
  await expect(p.getByRole("list", { name: "События портфеля по датам" })).toBeVisible();
  const offer = entry(page, "Оферта пут", PUT);
  await expect(offer).toContainText("Заявки принимаются с 2 дек. 2026 г. по 8 дек. 2026 г.");
  await expect(offer.locator(".stoa-countdown")).toHaveText(/^Осталось \d+ рабочи/);
  await expect(offer.getByRole("button", { name: "Подать заявку на выкуп по оферте" })).toBeVisible();
  await expect(p.getByRole("table", { name: "Выпуски в портфеле" }).getByRole("columnheader")).toHaveText(["Выпуск", "Облигаций", "Номинал", "Убрать из портфеля"]);
  await expect(p.getByTestId("income")).toContainText("Ежемесячный доход");
  await expect(p.getByTestId("income").locator("tbody tr").first()).toContainText("октябрь 2026");
});

test("on a phone the holdings, the events and the income fit without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?lang=ru&${PORTFOLIO}`);
  await ready(page);
  await expect(panel(page).getByTestId("income").locator("tbody tr")).toHaveCount(12);
  await expectNoHorizontalScroll(page, "holdings at 375");
});
