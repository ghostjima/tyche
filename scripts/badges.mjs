// Shields.io endpoint badges from what CI measured on this commit.
//
// Usage (CI's `badges` job runs it on the outputs of the other jobs; see
// .github/workflows/ci.yml):
//   node scripts/badges.mjs --out <dir>
//     --yield-tests <output of `cargo test --release -p tyche-yield`>
//     --market-tests <output of `cargo test --release -p tyche-market`>
//     --twin <output of `pnpm test` in packages/yield-twin>
//     --parity <TAP output of `node --test --test-reporter=tap crates/tyche-yield/node/parity.test.mjs`>
//     --yield-wasm <crates/tyche-yield/pkg/tyche_yield_bg.wasm>
//     --market-wasm <crates/tyche-market/pkg/tyche_market_bg.wasm>
//     --unit <output of `pnpm test` in apps/terminal>
//     --e2e <Playwright JSON report of apps/terminal>
//     --lighthouse-desktop <Lighthouse JSON> --lighthouse-mobile <Lighthouse JSON>
//     --dist <apps/terminal/dist>
//
// Each badge is one JSON file, {"schemaVersion":1,"label","message","color"},
// which CI commits to the `badges` branch for img.shields.io/endpoint to
// read. A value that cannot be read, or a run that did not pass, stops the
// script with an error: a badge is never written from a guess. No
// dependencies: Node 18 or later.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

class BadgeError extends Error {}
const fail = (message) => {
  throw new BadgeError(message);
};

const readBytes = (path) => {
  try {
    return readFileSync(path);
  } catch (e) {
    return fail(`cannot read ${path}: ${e.message}`);
  }
};
const readJson = (path) => {
  try {
    return JSON.parse(readBytes(path).toString("utf8"));
  } catch (e) {
    if (e instanceof BadgeError) throw e;
    return fail(`${path} is not JSON: ${e.message}`);
  }
};

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const linesOf = (text) => text.replace(ANSI, "").split(/\r?\n/);
const readLines = (path) => linesOf(readBytes(path).toString("utf8"));

const BINARY = /^\s*(Running|Doc-tests) (.+)$/;
const RESULT = /^test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out;/;

/** Test counts from `cargo test` output: one "test result" line for every
 * test binary and doc-test run that cargo announced. */
export function parseCargoTest(lines, what = "cargo test") {
  let binaries = 0;
  const results = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (BINARY.test(line)) binaries++;
    const m = RESULT.exec(line);
    if (m) results.push({ ok: m[1] === "ok", passed: +m[2], failed: +m[3], ignored: +m[4], filtered: +m[6] });
  }
  if (binaries === 0) fail(`no test binary in the ${what} output`);
  if (results.length !== binaries) fail(`${what}: cargo announced ${binaries} test runs but printed ${results.length} results`);
  const sum = (key) => results.reduce((n, r) => n + r[key], 0);
  if (results.some((r) => !r.ok) || sum("failed") > 0) fail(`${what}: ${sum("failed")} test(s) failed`);
  if (sum("filtered") > 0) fail(`${what}: tests were filtered out: not a full run`);
  if (sum("passed") === 0) fail(`${what}: no test passed`);
  return { passed: sum("passed"), ignored: sum("ignored") };
}

const SUMMARY = (name) => new RegExp(`^\\s*${name}\\s+(.+?)\\s+\\((\\d+)\\)\\s*$`);

/** The counts on one Vitest summary line ("Test Files" or "Tests"); there
 * must be exactly one, and its parts must add up to its total. */
function vitestLine(lines, name, kinds, what) {
  const re = SUMMARY(name);
  const found = lines.filter((l) => re.test(l));
  if (found.length !== 1) fail(`expected one Vitest "${name}" summary in the ${what} log, found ${found.length}`);
  const [, parts, total] = re.exec(found[0]);
  const counts = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (const part of parts.split("|")) {
    const p = new RegExp(`^\\s*(\\d+) (${kinds.join("|")})\\s*$`).exec(part);
    if (!p) fail(`unrecognised Vitest summary: "${found[0].trim()}"`);
    counts[p[2]] += Number(p[1]);
  }
  if (Object.values(counts).reduce((a, b) => a + b, 0) !== Number(total)) fail(`Vitest summary does not add up: "${found[0].trim()}"`);
  return counts;
}

/** Counts from the one Vitest summary in the output of one package's
 * `pnpm test`. A test file that failed to load counts as a failure even
 * when no test in it ran. */
export function parseVitest(lines, what = "unit test") {
  const files = vitestLine(lines, "Test Files", ["passed", "failed", "skipped"], what);
  if (files.failed > 0) fail(`${files.failed} ${what} file(s) failed`);
  const counts = vitestLine(lines, "Tests", ["passed", "failed", "skipped", "todo"], what);
  if (counts.failed > 0) fail(`${counts.failed} ${what}(s) failed`);
  if (counts.passed === 0) fail(`no ${what} passed`);
  return { passed: counts.passed, skipped: counts.skipped + counts.todo };
}

const TAP_POINT = /^(ok|not ok) \d+ - (.+)$/;
const TAP_COUNT = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/;
const PARITY = /^# parity (\{.*\})$/;
const PARITY_SETS = ["cases", "generated issues"];

/** What the parity run checked, from its TAP output: every test passed,
 * none skipped, and each passing test reported the size of its set, once.
 * The count is the set's own length, not a number written in a title. */
export function parseParity(lines) {
  const totals = {};
  const checked = {};
  let last = null;
  for (const line of lines) {
    const point = TAP_POINT.exec(line);
    if (point) last = { ok: point[1] === "ok", title: point[2] };
    const count = TAP_COUNT.exec(line);
    if (count) totals[count[1]] = Number(count[2]);
    const parity = PARITY.exec(line);
    if (parity) {
      if (!last?.ok) fail("a parity count follows a test that did not pass");
      let report;
      try {
        report = JSON.parse(parity[1]);
      } catch (e) {
        return fail(`unreadable parity count "${parity[1]}": ${e.message}`);
      }
      if (!PARITY_SETS.includes(report.checked) || !Number.isInteger(report.count)) fail(`unrecognised parity count "${parity[1]}"`);
      if (report.checked in checked) fail(`the parity run reported "${report.checked}" twice`);
      checked[report.checked] = report.count;
    }
  }
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    if (!(key in totals)) fail(`the parity output has no "# ${key}" total`);
  }
  if (totals.fail > 0 || totals.cancelled > 0) fail(`${totals.fail + totals.cancelled} parity test(s) did not pass`);
  if (totals.skipped > 0 || totals.todo > 0) fail("parity tests were skipped: not a full run");
  if (totals.pass !== totals.tests || totals.tests === 0) fail(`the parity run passed ${totals.pass} of ${totals.tests} tests`);
  for (const set of PARITY_SETS) {
    if (!(set in checked)) fail(`the parity run did not report how many ${set} it checked`);
    if (checked[set] === 0) fail(`the parity run checked no ${set}`);
  }
  return { cases: checked.cases, generated: checked["generated issues"] };
}

/** Pass counts from a Playwright JSON report (reporter "json"). */
export function readPlaywright(report) {
  const s = report?.stats;
  if (!s || ![s.expected, s.unexpected, s.flaky, s.skipped].every(Number.isInteger)) fail("the e2e report has no Playwright stats");
  if (s.unexpected > 0) fail(`${s.unexpected} e2e test(s) failed`);
  if (s.expected + s.flaky === 0) fail("no e2e test passed");
  return { passed: s.expected, flaky: s.flaky, skipped: s.skipped };
}

function* playwrightTests(suite) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) yield { title: spec.title, ...test };
  for (const child of suite.suites ?? []) yield* playwrightTests(child);
}

/** Titles of the e2e tests that run axe. */
const AXE_TEST = /^axe\b/;

/** The axe matrix, from the "axe-scan" annotations the e2e records: one
 * per scan, naming the language, the theme and the state of the screen.
 * A test titled "axe ..." that recorded no scan, a skipped one for
 * instance, stops the script, so a state cannot drop out of the count
 * unnoticed. */
export function readAxe(report) {
  const scans = [];
  for (const suite of report.suites ?? []) {
    for (const test of playwrightTests(suite)) {
      const notes = (test.annotations ?? []).filter((a) => a.type === "axe-scan");
      if (notes.length === 0) {
        if (AXE_TEST.test(test.title)) fail(`axe test "${test.title}" recorded no scan (${test.status})`);
        continue;
      }
      if (test.status !== "expected") fail(`axe test "${test.title}" did not pass`);
      for (const note of notes) scans.push(JSON.parse(note.description));
    }
  }
  if (scans.length === 0) fail("no axe scan in the e2e report");
  const distinct = (f) => new Set(scans.map(f)).size;
  const states = distinct((s) => s.state);
  const modes = distinct((s) => `${s.lang}/${s.theme}`);
  if (states * modes !== scans.length || distinct((s) => `${s.lang}/${s.theme}/${s.state}`) !== scans.length) {
    fail(`the axe scans are not a full matrix: ${scans.length} scans, ${states} states, ${modes} language and theme pairs`);
  }
  return { states, modes };
}

const CATEGORIES = { accessibility: "accessibility", "best-practices": "best practices", seo: "SEO" };

/** Lighthouse 13 category scores, 0 to 100, from one JSON report. */
export function readLighthouse(report, formFactor) {
  if (!String(report?.lighthouseVersion ?? "").startsWith("13.")) fail(`the ${formFactor} report is not from Lighthouse 13`);
  if (report.runtimeError) fail(`Lighthouse ${formFactor}: ${report.runtimeError.message ?? report.runtimeError.code}`);
  if (report.configSettings?.formFactor !== formFactor) fail(`the ${formFactor} report was run as ${report.configSettings?.formFactor}`);
  const scores = {};
  for (const id of Object.keys(CATEGORIES)) {
    const score = report.categories?.[id]?.score;
    if (typeof score !== "number") fail(`Lighthouse ${formFactor} has no ${id} score`);
    scores[id] = Math.round(score * 100);
  }
  return scores;
}

const lighthouseColor = (score) => (score >= 90 ? "brightgreen" : score >= 50 ? "orange" : "red");

/** gzip (level 9) of one file, which must not be empty. */
export const gzipBytes = (path) => {
  const data = readBytes(path);
  if (data.length === 0) fail(`${path} is empty`);
  return gzipSync(data, { level: 9 }).length;
};

/** gzip (level 9) of every JavaScript and CSS file the app's build wrote. */
export function bundleBytes(dist) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return fail(`cannot read ${dir}: ${e.message}`);
    }
    for (const e of entries) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (/\.(m?js|css)$/.test(e.name)) files.push(path);
    }
  };
  walk(dist);
  if (!files.some((f) => f.endsWith(".js"))) fail(`no JavaScript in ${dist}`);
  return files.reduce((n, f) => n + gzipSync(readBytes(f), { level: 9 }).length, 0);
}
const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

const REQUIRED = [
  "out",
  "yield-tests",
  "market-tests",
  "twin",
  "parity",
  "yield-wasm",
  "market-wasm",
  "unit",
  "e2e",
  "lighthouse-desktop",
  "lighthouse-mobile",
  "dist",
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!key || argv[i + 1] === undefined) fail(`expected --name value pairs, got "${argv.slice(i).join(" ")}"`);
    args[key] = argv[i + 1];
  }
  for (const key of REQUIRED) if (!args[key]) fail(`--${key} is required`);
  return args;
}

export function buildBadges(args) {
  const extra = (skipped, word = "skipped", flaky = 0) => `${skipped ? `, ${skipped} ${word}` : ""}${flaky ? `, ${flaky} flaky` : ""}`;
  const yieldTests = parseCargoTest(readLines(args["yield-tests"]), "tyche-yield cargo test");
  const marketTests = parseCargoTest(readLines(args["market-tests"]), "tyche-market cargo test");
  const twin = parseVitest(readLines(args.twin), "twin test");
  const parity = parseParity(readLines(args.parity));
  const unit = parseVitest(readLines(args.unit), "unit test");
  const report = readJson(args.e2e);
  const e2e = readPlaywright(report);
  const axe = readAxe(report);
  const desktop = readLighthouse(readJson(args["lighthouse-desktop"]), "desktop");
  const mobile = readLighthouse(readJson(args["lighthouse-mobile"]), "mobile");
  const badges = {
    "yield-tests": { label: "tyche-yield tests", message: `${yieldTests.passed} passed${extra(yieldTests.ignored, "ignored")}`, color: "brightgreen" },
    "market-tests": { label: "tyche-market tests", message: `${marketTests.passed} passed${extra(marketTests.ignored, "ignored")}`, color: "brightgreen" },
    "twin-tests": { label: "twin tests", message: `${twin.passed} passed${extra(twin.skipped)}`, color: "brightgreen" },
    parity: { label: "wasm and twin agree on", message: `${parity.cases} cases, ${parity.generated} generated issues`, color: "brightgreen" },
    "yield-wasm-size": { label: "tyche-yield wasm gzip", message: kB(gzipBytes(args["yield-wasm"])), color: "blue" },
    "market-wasm-size": { label: "tyche-market wasm gzip", message: kB(gzipBytes(args["market-wasm"])), color: "blue" },
    "unit-tests": { label: "unit tests", message: `${unit.passed} passed${extra(unit.skipped)}`, color: "brightgreen" },
    e2e: { label: "e2e", message: `${e2e.passed} passed${extra(e2e.skipped, "skipped", e2e.flaky)}`, color: e2e.flaky ? "yellow" : "brightgreen" },
    axe: { label: "axe", message: `0 serious, ${axe.states} states x ${axe.modes}`, color: "brightgreen" },
  };
  for (const [id, name] of Object.entries(CATEGORIES)) {
    const score = Math.min(desktop[id], mobile[id]);
    badges[`lighthouse-${id}`] = { label: `Lighthouse ${name} (min of desktop, mobile)`, message: String(score), color: lighthouseColor(score) };
  }
  badges["bundle-size"] = { label: "bundle gzip (JS + CSS)", message: kB(bundleBytes(args.dist)), color: "blue" };
  return badges;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const badges = buildBadges(args);
    mkdirSync(args.out, { recursive: true });
    for (const [name, { label, message, color }] of Object.entries(badges)) {
      const json = `${JSON.stringify({ schemaVersion: 1, label, message, color })}\n`;
      writeFileSync(join(args.out, `${name}.json`), json);
      process.stdout.write(`${name}.json ${json}`);
    }
  } catch (e) {
    if (!(e instanceof BadgeError)) throw e;
    console.error(`badges: ${e.message}`);
    process.exit(1);
  }
}
