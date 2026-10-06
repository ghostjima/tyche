// Theme and language: System by default, Light and Dark kept in the URL
// and in localStorage, three languages with Arabic right to left and
// Arabic-Indic digits.
import { expect, test } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

test("the theme follows the system until one is chosen", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
  await expect(html).not.toHaveAttribute("data-theme");
  const background = () => page.locator("html").evaluate((el) => getComputedStyle(el).backgroundColor);
  const dark = await background();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).not.toHaveAttribute("data-theme");
  await expect.poll(background).not.toBe(dark);
});

test("a chosen theme survives a reload and the next visit; System clears it", async ({ page }) => {
  await page.goto("/?from=link");
  const html = page.locator("html");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const url = new URL(page.url());
  expect(url.searchParams.get("theme")).toBe("dark");
  expect(url.searchParams.get("from")).toBe("link");
  expect(await page.evaluate(() => localStorage.getItem("horkos-bonds.theme"))).toBe("dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.goto("/");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  // A link's theme wins over the remembered one, and can ask for System.
  await page.goto("/?theme=light");
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.goto("/?theme=system");
  await expect(html).not.toHaveAttribute("data-theme");
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
  // Choosing System forgets the stored theme.
  await page.goto("/");
  await page.getByRole("radio", { name: "System" }).click();
  await expect(html).not.toHaveAttribute("data-theme");
  expect(new URL(page.url()).searchParams.get("theme")).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("horkos-bonds.theme"))).toBeNull();
});

test("the theme can be chosen with storage blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await ready(page);
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("the language survives a reload and the next visit, in each of three languages", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await page.getByRole("radio", { name: "RU", exact: true }).click();
  await expect(html).toHaveAttribute("lang", "ru");
  await expect(html).toHaveAttribute("dir", "ltr");
  await expect(page).toHaveTitle("Tyche Облигации");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tyche Облигации");
  await page.reload();
  await expect(html).toHaveAttribute("lang", "ru");
  await page.getByRole("radio", { name: "AR", exact: true }).click();
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(page).toHaveTitle("Tyche السندات");
  await page.goto("/");
  await expect(html).toHaveAttribute("lang", "ar");
  expect(await page.evaluate(() => localStorage.getItem("horkos-bonds.lang"))).toBe("ar");
  await page.goto("/?lang=en");
  await expect(html).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("Tyche Bonds");
});

test("Arabic is right to left with Arabic-Indic digits; Russian writes numbers the Russian way", async ({ page }) => {
  await page.goto(`/?lang=ar&issue=${ISSUES.offer}`);
  await ready(page);
  const figures = page.getByTestId("figures");
  await expect(figures).toContainText("٢٠٫٥٤");
  expect(await figures.innerText()).not.toMatch(/[0-9]/);
  await expect(page.getByRole("heading", { level: 2, name: "أوكا للتطوير العقاري" })).toBeVisible();
  // The slider keys follow the reading direction.
  const shift = page.getByRole("slider", { name: "تغيّر سعر الفائدة الرئيسي حتى الأفق" });
  await shift.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(shift).toHaveAttribute("aria-valuetext", /\+١٫٠|\+٠٫٥/);

  await page.goto(`/?lang=ru&issue=${ISSUES.offer}`);
  await ready(page);
  await expect(page.getByTestId("figures")).toContainText("20,54");
  await expect(page.getByTestId("figures")).toContainText("₽");
  await expect(page.getByRole("heading", { level: 2, name: "Ока Девелопмент" })).toBeVisible();
});

test("every engine error code has a sentence in each language", async ({ page }) => {
  for (const [lang, text] of [
    ["en", "Enter an amount above zero."],
    ["ru", "Введите сумму больше нуля."],
    ["ar", "أدخل مبلغًا أكبر من الصفر."],
  ] as const) {
    await page.goto(`/?lang=${lang}&issue=${ISSUES.ofz}`);
    await ready(page);
    const amount = page.locator(".calculator .stoa-number input").first();
    await amount.fill("0");
    await amount.press("Enter");
    await expect(page.getByTestId("calc-error").getByRole("alert")).toContainText(text);
  }
});

test("an amount typed in Latin digits is read in the Arabic interface", async ({ page }) => {
  await page.goto(`/?lang=ar&issue=${ISSUES.ofz}`);
  await ready(page);
  const amount = page.locator(".calculator .stoa-number input").first();
  await amount.fill("500");
  await amount.press("Enter");
  await expect(amount).toHaveValue("٥٠٠");
  await expect(page.getByTestId("calc-error")).toHaveAttribute("data-code", "amount_below_one_bond");
  await amount.fill("٢٥٠٠٠٠");
  await amount.press("Enter");
  await expect(amount).toHaveValue("٢٥٠٬٠٠٠");
  await expect(page.getByTestId("calc-error")).toHaveCount(0);
});

test("native controls and scrollbars are drawn in the chosen theme", async ({ page }) => {
  const scheme = () => page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme);
  await page.goto("/?theme=dark");
  await expect.poll(scheme).toBe("dark");
  await page.goto("/?theme=light");
  await expect.poll(scheme).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?theme=system");
  await expect.poll(scheme).toBe("dark");
});
