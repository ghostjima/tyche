// Measures the production build in headless Chromium and prints a
// Markdown report with its stamp (commit, dirty or clean, Chromium version,
// machine). Run `pnpm build` first; this serves dist/ with `vite preview`
// on port 4176.
//
//   node scripts/measure.mjs [coldLoads=10] [interactions=100]
//
// What each number is, and what it is not, is printed beside it.
import { spawn, execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const COLD = Number(process.argv[2] ?? 10);
const STEPS = Number(process.argv[3] ?? 100);
const BASE = "http://localhost:4176";
const ISSUES = { offer: "OKAD-01", floater: "AMRT-02", amortising: "ANGM-01", ofz: "OFZ-26217" };

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p95 = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(1, Math.ceil(0.95 * s.length)) - 1];
};
const fmt = (v, d = 2) => (v === undefined || Number.isNaN(v) ? "n/a" : v.toFixed(d));

function stamp() {
  const commit = execSync("git rev-parse --short HEAD").toString().trim();
  const dirty = execSync("git status --porcelain").toString().trim() !== "";
  return { commit, dirty };
}

function sizes() {
  const dir = "dist/assets";
  const rows = [];
  for (const name of readdirSync(dir)) {
    const bytes = readFileSync(join(dir, name));
    if (!/\.(js|css|wasm)$/.test(name)) continue;
    rows.push({ name, raw: statSync(join(dir, name)).size, gzip: gzipSync(bytes, { level: 9 }).length });
  }
  return rows.sort((a, b) => b.raw - a.raw);
}

async function serve() {
  const child = spawn("npx", ["vite", "preview", "--port", "4176", "--strictPort"], { stdio: "pipe" });
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error("vite preview did not start");
}

async function coldLoads(browser) {
  const out = [];
  for (let i = 0; i < COLD; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/?issue=${ISSUES.offer}`);
    await page.waitForSelector('.app[data-state="ready"][data-engine="wasm"]');
    out.push(
      await page.evaluate(() => {
        const one = (name) => performance.getEntriesByName(name)[0];
        return {
          fcp: one("first-contentful-paint")?.startTime,
          wasm: one("tyche:wasm-init")?.duration,
          listReady: one("tyche:list-ready")?.startTime,
        };
      }),
    );
    await context.close();
  }
  return out;
}

async function engineTimings(page) {
  const out = {};
  for (const [kind, id] of Object.entries(ISSUES)) {
    await page.goto(`${BASE}/?issue=${id}`);
    await page.waitForSelector('.app[data-state="ready"][data-engine="wasm"]');
    await page.locator(".foot__actions button").first().click();
    const sheet = page.getByRole("dialog");
    await sheet.locator(".diagnostics > button").click();
    await sheet.locator("tbody tr").nth(3).waitFor();
    const rows = await sheet.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent)));
    out[`${kind} ${id}`] = rows;
    await page.keyboard.press("Escape");
  }
  return out;
}

/** In the page: `steps` times, do something and wait for the DOM under
 * `watch` to change (React has committed) and then for the next animation
 * frame. Returns both delays per step, in milliseconds. */
async function interaction(page, setup, watch, steps) {
  return page.evaluate(
    async ({ setup, watch, steps }) => {
      const act = new Function("i", setup);
      const target = document.querySelector(watch);
      const commit = [];
      const frame = [];
      for (let i = 0; i < steps; i++) {
        const changed = new Promise((resolve) => {
          const mo = new MutationObserver(() => {
            mo.disconnect();
            resolve(performance.now());
          });
          mo.observe(target, { subtree: true, childList: true, characterData: true });
        });
        const t0 = performance.now();
        act(i);
        const t1 = await changed;
        const t2 = await new Promise((r) => requestAnimationFrame(() => r(performance.now())));
        commit.push(t1 - t0);
        frame.push(t2 - t0);
        await new Promise((r) => setTimeout(r, 20));
      }
      return { commit, frame };
    },
    { setup, watch, steps },
  );
}

async function interactions(page) {
  await page.goto(`${BASE}/?issue=${ISSUES.floater}`);
  await page.waitForSelector('.app[data-state="ready"][data-engine="wasm"]');
  // The horizon slider: one key step, alternating directions, to the
  // calculator's result redrawn.
  const horizon = await interaction(
    page,
    `const input = document.querySelector('.calc-horizon input[type="range"]');
     input.dispatchEvent(new KeyboardEvent('keydown', { key: i % 2 ? 'ArrowLeft' : 'ArrowRight', bubbles: true }));`,
    '[data-testid="result"]',
    STEPS,
  );
  // A filter chip pressed (a virtual click, as a keyboard or screen reader
  // press is), to the list redrawn.
  const chip = await interaction(
    page,
    `document.querySelectorAll('.stoa-filter-chip')[3].click();`,
    ".pane-list tbody",
    STEPS,
  );
  return { horizon, chip };
}

const server = await serve();
try {
  const browser = await chromium.launch();
  const version = browser.version();
  const loads = await coldLoads(browser);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const engines = await engineTimings(page);
  const inter = await interactions(page);
  await browser.close();
  const { commit, dirty } = stamp();
  const files = sizes();
  const js = files.filter((f) => f.name.endsWith(".js"));

  const lines = [];
  lines.push(`Build ${commit}${dirty ? " (working tree not clean)" : ""}, production build served by vite preview; headless Chromium ${version}; ${cpus()[0].model}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GB.`, "");
  lines.push(`Cold loads: ${COLD}, each in a new browser context (empty cache), /?issue=${ISSUES.offer}, 1440 x 900. Median and 95th percentile (nearest rank) over the loads, milliseconds:`, "");
  lines.push("| metric | what it measures | median | p95 |", "|---|---|---|---|");
  const col = (k) => loads.map((l) => l[k]).filter((v) => v !== undefined);
  lines.push(`| first contentful paint | navigation start to the first paint with content (the header and the loading skeleton) | ${fmt(median(col("fcp")), 1)} | ${fmt(p95(col("fcp")), 1)} |`);
  lines.push(`| WebAssembly load and instantiate | \`await init()\`: fetch of the .wasm from the local server, compile and instantiate | ${fmt(median(col("wasm")), 1)} | ${fmt(p95(col("wasm")), 1)} |`);
  lines.push(`| list ready | navigation start to the commit of the first render with all sixty issues derived (the mark \`tyche:list-ready\`) | ${fmt(median(col("listReady")), 1)} | ${fmt(p95(col("listReady")), 1)} |`, "");
  lines.push("Engine calls, from the diagnostics sheet's \"Time both engines\": per call, median and 95th percentile over 200 samples, each sample the mean of 10 consecutive calls, after 20 warm-up batches; one run per issue, in one warm page:", "");
  lines.push("| issue | engine | function | median | p95 |", "|---|---|---|---|---|");
  for (const [issue, rows] of Object.entries(engines)) for (const r of rows) lines.push(`| ${issue} | ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`);
  lines.push("", `Interactions on /?issue=${ISSUES.floater}, ${STEPS} steps each, 20 ms apart, milliseconds; "commit" is the event dispatched to the DOM under the watched element changing (React committed), "frame" is to the next animation frame after that. Neither includes the browser's own input latency or the paint itself:`, "");
  lines.push("| interaction | commit median | commit p95 | frame median | frame p95 |", "|---|---|---|---|---|");
  for (const [name, label] of [["horizon", "horizon slider, one key step, to the calculator's result"], ["chip", "filter chip press, to the list"]]) {
    const r = inter[name];
    lines.push(`| ${label} | ${fmt(median(r.commit))} | ${fmt(p95(r.commit))} | ${fmt(median(r.frame))} | ${fmt(p95(r.frame))} |`);
  }
  lines.push("", "Files in dist/assets, bytes; gzip is level 9 (Node zlib), what a server would send compressed:", "");
  lines.push("| file | raw | gzip |", "|---|---|---|");
  for (const f of files) lines.push(`| ${f.name} | ${f.raw} | ${f.gzip} |`);
  lines.push(`| all JavaScript | ${js.reduce((a, f) => a + f.raw, 0)} | ${js.reduce((a, f) => a + f.gzip, 0)} |`);
  console.log(lines.join("\n"));
} finally {
  server.kill();
}
