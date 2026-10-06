// The WebAssembly engine and the TypeScript twin render the same figures
// for the same inputs, and the diagnostics switch between them and time
// both.
import { expect, test, type Page } from "@playwright/test";
import { ISSUES, ready } from "./helpers";

// Timing both engines runs 8,800 calls (two engines, two functions, 20
// warm-up and 200 kept batches of 10); a shared CI runner takes well over
// the default five seconds, so the rows get a minute to appear.
const TIMING_DONE = { timeout: 60_000 };

/** Every figure the screen shows for the open issue and plan, as text. */
async function figures(page: Page): Promise<string[]> {
  const parts = [
    page.getByTestId("figures"),
    page.locator(".issue-card .stoa-statbar"),
    page.getByRole("table", { name: "Payments per bond" }),
    page.getByTestId("result"),
  ];
  const out: string[] = [];
  for (const part of parts) out.push(await part.innerText());
  // The price curve's data table holds the curve's values.
  const curve = page.locator(".issue-card .stoa-chart table");
  if ((await curve.count()) > 0) out.push(await curve.innerText());
  return out;
}

/** A plan away from the defaults, so each input reaches the engine. */
async function setPlan(page: Page) {
  const amount = page.getByLabel("Amount, ₽");
  await amount.fill("345678");
  await amount.press("Enter");
  const other = page.getByLabel("Other investment income per year, ₽");
  await other.fill("2390000");
  await other.press("Enter");
  const shift = page.getByRole("slider", { name: "Key rate change by the horizon" });
  await shift.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(shift).toHaveAttribute("aria-valuetext", "-1.5 pp");
}

for (const [kind, id] of Object.entries(ISSUES)) {
  test(`both engines render identical figures (${kind} issue ${id})`, async ({ page }) => {
    await page.goto(`/?lang=en&issue=${id}`);
    await ready(page, "wasm");
    await setPlan(page);
    const wasm = await figures(page);

    await page.goto(`/?lang=en&issue=${id}&engine=twin`);
    await ready(page, "twin");
    await setPlan(page);
    const twin = await figures(page);

    expect(twin).toEqual(wasm);
    expect(wasm.join("\n")).toMatch(/₽/);
  });
}

test("the diagnostics switch engines without changing a figure, and time both", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.floater}`);
  await ready(page, "wasm");
  const before = await figures(page);
  await page.getByRole("button", { name: "Engine diagnostics" }).click();
  const sheet = page.getByRole("dialog", { name: "Engine diagnostics" });
  await expect(sheet).toContainText("WebAssembly load and instantiate");
  await sheet.getByRole("radio", { name: "TypeScript" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-engine", "twin");
  expect(new URL(page.url()).searchParams.get("engine")).toBe("twin");

  await sheet.getByRole("button", { name: "Time both engines" }).click();
  const timings = sheet.getByRole("table", { name: /Time per call on this issue and plan/ });
  await expect(timings.locator("tbody tr")).toHaveCount(4, TIMING_DONE);
  await expect(timings).toContainText("derive_bond");
  await expect(timings).toContainText("calculate");
  await expect(timings).toContainText("ms");

  await sheet.getByRole("radio", { name: "WebAssembly" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-engine", "wasm");
  expect(new URL(page.url()).searchParams.get("engine")).toBeNull();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  expect(await figures(page)).toEqual(before);
});

test("the load leaves the product's marks on the performance timeline, which the measurement script reads", async ({ page }) => {
  await page.goto(`/?lang=en&issue=${ISSUES.offer}`);
  await ready(page, "wasm");
  const marks = await page.evaluate(() =>
    performance
      .getEntries()
      .filter((e) => e.entryType === "mark" || e.entryType === "measure")
      .map((e) => `${e.entryType}:${e.name}`)
      .filter((name) => /:(tyche|horkos):/.test(name))
      .sort(),
  );
  expect(marks).toEqual(["mark:tyche:list-ready", "mark:tyche:universe-start", "mark:tyche:wasm-start", "measure:tyche:universe", "measure:tyche:wasm-init"]);
});
