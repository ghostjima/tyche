import assert from "node:assert/strict";
import { test } from "node:test";
import { readAxe } from "./badges.mjs";

// A Playwright JSON report (reporter "json") with one spec per test, each
// passed unless `status` says otherwise, carrying the "axe-scan"
// annotations the e2e records.
function report(tests) {
  return {
    suites: [
      {
        title: "a11y.spec.ts",
        specs: tests.map(({ title, status = "expected", scans = [] }) => ({
          title,
          tests: [
            {
              status,
              annotations: scans.map(([state, lang, theme]) => ({ type: "axe-scan", description: JSON.stringify({ lang, theme, state }) })),
            },
          ],
        })),
      },
    ],
  };
}

const MODES = [
  ["ru", "light"],
  ["ru", "dark"],
  ["en", "light"],
  ["en", "dark"],
];

test("one test per state: the states and the language and theme pairs are counted from the scans", () => {
  const tests = MODES.flatMap(([lang, theme]) =>
    ["list", "floater", "diagnostics"].map((state) => ({ title: `axe: ${state} (${lang}, ${theme})`, scans: [[state, lang, theme]] })),
  );
  assert.deepEqual(readAxe(report(tests)), { states: 3, modes: 4 });
});

test("several scans in one test count the same as one test per scan", () => {
  const tests = MODES.map(([lang, theme]) => ({
    title: `axe: ready states (${lang}, ${theme})`,
    scans: ["list", "floater", "diagnostics"].map((state) => [state, lang, theme]),
  }));
  assert.deepEqual(readAxe(report(tests)), { states: 3, modes: 4 });
});

test("tests that are not axe tests are not counted", () => {
  const tests = [
    { title: "axe: list (ru, light)", scans: [["list", "ru", "light"]] },
    { title: "the list shows the synthetic universe" },
  ];
  assert.deepEqual(readAxe(report(tests)), { states: 1, modes: 1 });
});

test("a state scanned in some language and theme pairs only is not a full matrix", () => {
  const tests = MODES.flatMap(([lang, theme]) => [
    { title: `axe: list (${lang}, ${theme})`, scans: [["list", lang, theme]] },
    ...(lang === "ru" ? [{ title: `axe: floater (${lang}, ${theme})`, scans: [["floater", lang, theme]] }] : []),
  ]);
  assert.throws(() => readAxe(report(tests)), /not a full matrix: 6 scans, 2 states, 4 language and theme pairs/);
});

test("an axe test that did not pass stops the script", () => {
  const tests = [
    { title: "axe: list (ru, light)", scans: [["list", "ru", "light"]] },
    { title: "axe: floater (ru, light)", status: "unexpected", scans: [["floater", "ru", "light"]] },
  ];
  assert.throws(() => readAxe(report(tests)), /axe test "axe: floater \(ru, light\)" did not pass/);
});

test("an axe test that scanned nothing stops the script, so a skipped state is not dropped from the count", () => {
  const tests = MODES.flatMap(([lang, theme]) => [
    { title: `axe: list (${lang}, ${theme})`, scans: [["list", lang, theme]] },
    { title: `axe: floater (${lang}, ${theme})`, status: "skipped" },
  ]);
  assert.throws(() => readAxe(report(tests)), /axe test "axe: floater \(ru, light\)" recorded no scan/);
});

test("a report without an axe scan stops the script", () => {
  assert.throws(() => readAxe(report([{ title: "the list shows the synthetic universe" }])), /no axe scan in the e2e report/);
});
