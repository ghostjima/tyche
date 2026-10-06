// The language from the first paint, and the faces the page loads: the
// page's language is set by the HTML itself, before any script module
// runs, Russian unless the link or the last visit says otherwise; only
// the Latin and Cyrillic faces are fetched.
import { expect, test } from "@playwright/test";
import { ready } from "./helpers";

test("lang comes from the link or the last visit before the app's script runs, Russian otherwise", async ({ page }) => {
  // No module script at all: what is left is the HTML and its inline script.
  await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
  await page.route(/\/src\/.*$/, (route) => route.abort());
  const html = page.locator("html");
  await page.goto("/");
  await expect(html).toHaveAttribute("lang", "ru");
  await expect(html).toHaveAttribute("dir", "ltr");

  await page.goto("/?lang=en&theme=dark");
  await expect(html).toHaveAttribute("lang", "en");
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.evaluate(() => localStorage.setItem("tyche.lang", "en"));
  await page.goto("/");
  await expect(html).toHaveAttribute("lang", "en");
  // A language the product does not have is ignored, as is the old key.
  await page.goto("/?lang=ar");
  await expect(html).toHaveAttribute("lang", "en");
  await page.evaluate(() => {
    localStorage.removeItem("tyche.lang");
    localStorage.setItem("horkos-bonds.lang", "en");
  });
  await page.goto("/");
  await expect(html).toHaveAttribute("lang", "ru");
  await expect(html).toHaveAttribute("dir", "ltr");
});

test("the first-paint script sits in the head, after the charset, which stays in the first 1,024 bytes", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const charset = html.indexOf('<meta charset="UTF-8"');
  expect(charset).toBeGreaterThanOrEqual(0);
  expect(charset).toBeLessThan(1024);
  const script = html.indexOf('"languageKey":"tyche.lang"');
  expect(script).toBeGreaterThan(charset);
  expect(script).toBeLessThan(html.indexOf("</head>"));
  expect(html).toContain('"themeKey":"tyche.theme"');
});

test("no font is preloaded, and no Arabic face is fetched", async ({ page }) => {
  const fonts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") fonts.push(request.url());
  });
  for (const lang of ["ru", "en"]) {
    await page.goto(`/?lang=${lang}`);
    await ready(page);
    expect(await page.locator('link[rel="preload"][as="font"]').count(), lang).toBe(0);
  }
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.filter((url) => /arabic/i.test(url))).toEqual([]);
  // The bundle declares no Arabic face to download either. (Stoa's styles
  // keep local metric fallbacks for Arabic, which fetch nothing.)
  const faces = await page.evaluate(() =>
    [...document.styleSheets].flatMap((s) => [...s.cssRules].filter((r) => r instanceof CSSFontFaceRule).map((r) => r.cssText)),
  );
  expect(faces.length).toBeGreaterThan(0);
  expect(faces.filter((f) => /arabic/i.test(f) && /url\(/.test(f))).toEqual([]);
});
