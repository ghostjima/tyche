// The built page's Content Security Policy (csp.ts), in the browser: the
// policy the page states, the hashes in it against the inline script and
// the style elements as the browser reads them, no violation in the main
// states, and what the policy refuses.
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { ISSUES, PORTFOLIO, PORTFOLIO_PUT, ready } from "./helpers";

const LANGS = ["ru", "en"] as const;
const THEMES = ["light", "dark"] as const;
/** Stoa's words on the theme switch. */
const THEME_WORDS = { ru: { light: "Светлая", dark: "Тёмная" }, en: { light: "Light", dark: "Dark" } } as const;

const hashSource = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/** What went wrong on the page since `watch`: the policy's violations as
 * the browser reports them to the document, and errors on the console
 * (the browser writes one for each violation too) or thrown. */
type Seen = { violations: string[]; errors: string[] };

async function watch(page: Page): Promise<Seen> {
  const seen: Seen = { violations: [], errors: [] };
  await page.exposeFunction("reportViolation", (violation: string) => {
    seen.violations.push(violation);
  });
  await page.addInitScript(() => {
    const report = (window as unknown as { reportViolation: (violation: string) => void }).reportViolation;
    document.addEventListener("securitypolicyviolation", (event) => {
      report(`${event.effectiveDirective} ${event.blockedURI}${event.sample ? ` ${event.sample}` : ""}`);
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") seen.errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    seen.errors.push(error.message);
  });
  return seen;
}

async function open(page: Page, lang: string, theme: string, query = "") {
  await page.goto(`/?lang=${lang}&theme=${theme}${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
}

/** The policy the page states, by directive. */
async function statedPolicy(page: Page): Promise<Record<string, string[]>> {
  const content = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  return Object.fromEntries((content ?? "").split("; ").map((directive) => [directive.split(" ")[0] ?? "", directive.split(" ").slice(1)]));
}

const inlineScripts = (page: Page) => page.evaluate(() => [...document.scripts].filter((script) => !script.src).map((script) => script.textContent ?? ""));
const styleElements = (page: Page) => page.evaluate(() => [...document.querySelectorAll("style")].map((style) => style.textContent ?? ""));

test("the page states its policy first in the head, and the script hash is the hash of the inline script in the page", async ({ page }) => {
  await page.goto("/?lang=en");
  await ready(page);
  // In the file as served: right after the charset, before every script,
  // stylesheet and link.
  const html = await (await page.request.get("/")).text();
  const at = (pattern: RegExp) => html.search(pattern);
  expect(at(/<meta charset=/)).toBeGreaterThan(-1);
  expect(at(/<meta charset=/)).toBeLessThan(at(/<meta http-equiv="Content-Security-Policy"/));
  expect(at(/<meta http-equiv="Content-Security-Policy"/)).toBeLessThan(at(/<(script|link|style)\b/));
  expect(html.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(1);

  const scripts = await inlineScripts(page);
  expect(scripts).toHaveLength(1);
  expect(scripts[0]).toContain("tyche.lang");
  const policy = await statedPolicy(page);
  // Every hash in script-src is an inline script of the page and every
  // inline script has its hash: none missing, none stale.
  expect(policy["script-src"]).toEqual(["'self'", ...scripts.map(hashSource), "'wasm-unsafe-eval'"]);
  expect(policy).toEqual({
    "default-src": ["'self'"],
    "script-src": policy["script-src"],
    "style-src": ["'self'", "'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o='", "'sha256-gYiS/BvZvRcK27JIXTuwhZ3hs2+VJ1X+2gUlE+farlg='"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "worker-src": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'none'"],
    "object-src": ["'none'"],
  });
});

test("the first-paint script runs under the policy, before the app's own script", async ({ page }) => {
  const seen = await watch(page);
  // Without the app's script, only the inline one can have set these.
  await page.route("**/assets/index-*.js", (route) => route.abort());
  await page.goto("/?lang=en&theme=dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(seen.violations).toEqual([]);
});

// The main states, each from a fresh navigation, with both engines
// loaded: tyche-yield's WebAssembly on the page and tyche-market's in the
// worker. Overlays are opened, the engine is switched to the TypeScript
// twin and back, and the theme and the language are changed in the page.
for (const lang of LANGS) {
  for (const theme of THEMES) {
    test(`no policy violation and no console error in the main states (${lang}, ${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      const seen = await watch(page);

      // The list, an issue with its working and glossary open.
      await open(page, lang, theme, `&issue=${ISSUES.offer}`);
      await ready(page, "wasm");
      await page.locator(".glossary summary").click();
      await page.getByTestId("working").locator("summary").click();
      await expect(page.locator(".working .stoa-table").first()).toBeVisible();
      // The order ticket's confirmation, an alert dialog, then recorded.
      await expect(page.getByTestId("ticket-depth").locator("tbody tr")).toHaveCount(1);
      await page.getByTestId("ticket-gate").locator("label").filter({ has: page.locator('input[value="qualified"]') }).click();
      await page.locator(".ticket__actions").getByRole("button").click();
      await page.getByRole("alertdialog").getByRole("button").last().click();
      await expect(page.locator(".ticket__recorded")).toBeVisible();

      // The diagnostics sheet: the twin, and WebAssembly again.
      await page.locator(".foot__actions button").first().click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await sheet.getByRole("radio").nth(1).click();
      await expect(page.locator(".app")).toHaveAttribute("data-engine", "twin");
      await sheet.getByRole("radio").first().click();
      await expect(page.locator(".app")).toHaveAttribute("data-engine", "wasm");
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);

      // A floater with its chart, a comparison, the holdings with their
      // calendar and a redemption request, the ladder, the placements and
      // the data page.
      await open(page, lang, theme, `&issue=${ISSUES.floater}&cmp=${ISSUES.offer}&cmp=BELB-02`);
      await ready(page);
      await expect(page.getByTestId("floater")).toBeVisible();
      await expect(page.locator(".compare")).toBeVisible();
      await open(page, lang, theme, `&${PORTFOLIO}&ev=calendar`);
      await ready(page);
      await expect(page.getByTestId("inbox").locator(".stoa-calendar__nav").last()).toBeVisible();
      await open(page, lang, theme, `&hold=${PORTFOLIO_PUT}*10`);
      await ready(page);
      await page.locator(".stoa-request").getByRole("button").click();
      await page.getByRole("alertdialog").getByRole("button").last().click();
      await expect(page.locator(".stoa-request__recorded")).toBeVisible();
      await open(page, lang, theme, "&lh=3&la=1000000");
      await ready(page);
      await expect(page.getByTestId("rung")).toHaveCount(3);
      await open(page, lang, theme, "&pl=1");
      await ready(page);
      await expect(page.getByTestId("placement")).toHaveCount(4);
      await open(page, lang, theme, "&page=data");
      await ready(page);
      await expect(page.locator(".data-page")).toBeVisible();

      // The other theme and the other language, chosen in the page.
      const otherTheme = theme === "light" ? "dark" : "light";
      await page.getByRole("radio", { name: THEME_WORDS[lang][otherTheme], exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", otherTheme);
      const otherLang = lang === "ru" ? "en" : "ru";
      await page.getByRole("radio", { name: otherLang.toUpperCase(), exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", otherLang);

      // Every style element in the page is one the policy names.
      const allowed = (await statedPolicy(page))["style-src"] ?? [];
      const styles = await styleElements(page);
      expect(styles.length).toBeGreaterThan(0);
      for (const style of styles) expect(allowed, `the policy has no hash for this style element:\n${style}`).toContain(hashSource(style));

      expect(seen.violations).toEqual([]);
      expect(seen.errors).toEqual([]);
    });

    // The states without one engine or the other. A file that does not
    // load is an error on the console, so only violations are counted.
    test(`no policy violation while loading, on the WebAssembly fallback or when the market fails (${lang}, ${theme})`, async ({ page }) => {
      const seen = await watch(page);
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/*.wasm", async (route) => {
        await held;
        await route.continue();
      });
      await open(page, lang, theme, `&issue=${ISSUES.offer}`);
      await expect(page.locator(".app")).toHaveAttribute("data-state", "loading");
      release();
      await ready(page);

      await page.unroute("**/*.wasm");
      await page.route("**/tyche_yield_bg*.wasm", (route) => route.abort());
      await open(page, lang, theme, `&issue=${ISSUES.offer}`);
      await ready(page, "twin");
      await expect(page.locator(".stoa-callout--warning")).toBeVisible();
      await expect(page.getByTestId("result")).toBeVisible();

      await page.unroute("**/tyche_yield_bg*.wasm");
      await page.route("**/tyche_market_bg*.wasm", (route) => route.abort());
      await open(page, lang, theme);
      await expect(page.locator(".app")).toHaveAttribute("data-state", "failed");

      expect(seen.violations).toEqual([]);
    });
  }
}

// React Aria adds a second style element on iOS, when an overlay opens
// (usePreventScroll). Chromium is told it is an iPhone, which is all
// React Aria asks, so the element is added here too.
test("the style element React Aria adds on iOS is one the policy names", async ({ page }) => {
  const seen = await watch(page);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "iPhone" });
    Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
  });
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page);
  await page.getByRole("button", { name: "Engine diagnostics" }).click();
  await expect(page.getByRole("dialog", { name: "Engine diagnostics" })).toBeVisible();
  const styles = await styleElements(page);
  expect(styles.some((style) => style.includes("overscroll-behavior"))).toBe(true);
  expect(styles.some((style) => style.includes("touch-action"))).toBe(true);
  const allowed = (await statedPolicy(page))["style-src"] ?? [];
  for (const style of styles) expect(allowed, `the policy has no hash for this style element:\n${style}`).toContain(hashSource(style));
  expect(seen.violations).toEqual([]);
});

test("the policy refuses injected scripts, handlers, eval, styles and anything from another origin", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/?lang=en");
  await ready(page);
  expect(seen.violations).toEqual([]);

  const outcome = await page.evaluate(async () => {
    const marks = window as unknown as { injectedScript?: boolean; injectedHandler?: boolean };
    const result: Record<string, unknown> = {};

    // An inline script element, as markup injected into the page would add.
    const inline = document.createElement("script");
    inline.textContent = "window.injectedScript = true;";
    document.head.append(inline);
    result.inlineScript = marks.injectedScript === true ? "ran" : "blocked";

    // An inline event handler.
    const button = document.createElement("button");
    button.setAttribute("onclick", "window.injectedHandler = true;");
    document.body.append(button);
    button.click();
    button.remove();
    result.inlineHandler = marks.injectedHandler === true ? "ran" : "blocked";

    // eval and the Function constructor: 'wasm-unsafe-eval' allows
    // neither.
    const attempt = (run: () => unknown) => {
      try {
        run();
        return "ran";
      } catch (error) {
        return error instanceof Error ? error.name : "thrown";
      }
    };
    // From a timer, as the page's own code would call them: called
    // straight from the test's evaluation, the browser's debugger lets
    // them through.
    const later = (run: () => unknown) => new Promise<string>((resolve) => setTimeout(() => resolve(attempt(run)), 0));
    result.eval = await later(() => (0, eval)("1 + 1"));
    result.functionConstructor = await later(() => new Function("return 1")());

    // A script, a stylesheet and an image from another origin, and a
    // request to one. `.invalid` never resolves; the policy refuses each
    // before any request is made.
    const loaded = (el: HTMLElement) =>
      new Promise<string>((resolve) => {
        el.addEventListener("load", () => resolve("loaded"));
        el.addEventListener("error", () => resolve("blocked"));
        document.head.append(el);
      });
    const script = document.createElement("script");
    script.src = "https://script.invalid/x.js";
    result.foreignScript = await loaded(script);
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = "https://style.invalid/x.css";
    result.foreignStylesheet = await loaded(sheet);
    const image = document.createElement("img");
    image.src = "https://image.invalid/x.png";
    result.foreignImage = await loaded(image);
    result.foreignRequest = await fetch("https://connect.invalid/").then(
      () => "sent",
      () => "blocked",
    );

    // An inline style element and a style attribute set as markup would.
    const style = document.createElement("style");
    style.textContent = "#root { outline: 7px solid red; }";
    document.head.append(style);
    result.inlineStyle = getComputedStyle(document.getElementById("root") ?? document.body).outlineWidth === "7px" ? "applied" : "blocked";
    const box = document.createElement("div");
    box.setAttribute("style", "outline: 7px solid red;");
    document.body.append(box);
    result.styleAttribute = getComputedStyle(box).outlineWidth === "7px" ? "applied" : "blocked";
    box.remove();

    // A base element that would move the page's relative URLs.
    const base = document.createElement("base");
    base.href = "https://base.invalid/";
    document.head.append(base);
    result.base = document.baseURI.startsWith("https://base.invalid") ? "applied" : "blocked";
    base.remove();

    // A plugin.
    const object = document.createElement("object");
    object.data = "https://object.invalid/x.swf";
    document.body.append(object);
    return result;
  });

  expect(outcome).toEqual({
    inlineScript: "blocked",
    inlineHandler: "blocked",
    eval: "EvalError",
    functionConstructor: "EvalError",
    foreignScript: "blocked",
    foreignStylesheet: "blocked",
    foreignImage: "blocked",
    foreignRequest: "blocked",
    inlineStyle: "blocked",
    styleAttribute: "blocked",
    base: "blocked",
  });
  // A form posted anywhere: a navigation the policy stops.
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "https://form.invalid/";
    document.body.append(form);
    form.submit();
  });
  await expect.poll(() => seen.violations.map((violation) => violation.split(" ")[0]).sort()).toEqual(
    ["base-uri", "connect-src", "form-action", "img-src", "object-src", "script-src", "script-src", "script-src-attr", "script-src-elem", "script-src-elem", "style-src-attr", "style-src-elem", "style-src-elem"],
  );
  expect(new URL(page.url()).pathname).toBe("/");
});

test("the page's address goes to no one as a referrer, and no link opens a new tab without noopener", async ({ page }) => {
  const referers = new Set<string>();
  page.on("request", (request) => {
    const referer = request.headers()["referer"];
    if (referer) referers.add(referer);
  });
  await page.goto(`/?lang=en&issue=${ISSUES.offer}&${PORTFOLIO}`);
  await ready(page);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  // Stated before the scripts and the stylesheet
  // (DOCUMENT_POSITION_FOLLOWING), so their requests follow it.
  expect(await page.evaluate(() => document.querySelector('meta[name="referrer"]')?.compareDocumentPosition(document.querySelector("script[src]") ?? document.body))).toBe(4);
  // The page's own requests carry no Referer. The stylesheet's requests
  // for fonts and the worker's for its WebAssembly follow those files'
  // policy, not the page's, and name only the file, never the page's
  // address with the holdings in it.
  expect(referers.size).toBeGreaterThan(0);
  for (const referer of referers) expect(referer).toMatch(/\/assets\/[^?]+\.(css|js)$/);

  // A link out, to the Bank of Russia: the request it makes has no Referer.
  let asked: Record<string, string> | null = null;
  await page.route("https://www.cbr.ru/**", async (route) => {
    asked = route.request().headers();
    await route.fulfill({ contentType: "text/html", body: "<title>cbr.ru</title>" });
  });
  await page.locator('a[href="https://www.cbr.ru/"]').first().click();
  await expect(page).toHaveTitle("cbr.ru");
  expect(asked).not.toBeNull();
  expect(asked?.["referer"]).toBeUndefined();

  for (const query of [`&issue=${ISSUES.offer}`, "&page=data", `&${PORTFOLIO}`]) {
    await page.goto(`/?lang=en${query}`);
    await ready(page);
    const unsafe = await page.locator('a[target="_blank"]').evaluateAll((links) => links.filter((link) => !/\bnoopener\b/.test(link.getAttribute("rel") ?? "") || !/\bnoreferrer\b/.test(link.getAttribute("rel") ?? "")).map((link) => link.outerHTML));
    expect(unsafe).toEqual([]);
  }
});
