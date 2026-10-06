// The Bank of Russia snapshot's parsers and builder, on responses saved
// from cbr.ru on 2026-10-06 (scripts/fixtures/cbr).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isoDate, keyRateOn, number, parseCurve, parseInflation, parseKeyRate, parseRuonia } from "./cbr/parse.mjs";
import { buildSnapshot, pageUrl, soapRequest } from "./cbr/snapshot.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "cbr");
const fixture = (name) => readFileSync(join(FIX, name), "utf8");

test("dates and numbers as cbr.ru writes them", () => {
  assert.equal(isoDate("05.10.2026"), "2026-10-05");
  assert.equal(isoDate("2026-10-05T00:00:00+03:00"), "2026-10-05");
  assert.throws(() => isoDate("10/05/2026"));
  assert.equal(number("12,04"), 12.04);
  assert.equal(number(" 14.00 "), 14);
  assert.throws(() => number("—"));
});

test("the key rate comes back as its changes, from the service's daily rows", () => {
  const k = parseKeyRate(fixture("key-rate.xml"));
  assert.deepEqual(k.changes, [
    { from: "2026-06-01", pct: 14.5 },
    { from: "2026-06-22", pct: 14.25 },
    { from: "2026-07-27", pct: 14 },
  ]);
  assert.equal(k.lastDay, "2026-10-06");
  assert.equal(keyRateOn(k.changes, "2026-06-21"), 14.5);
  assert.equal(keyRateOn(k.changes, "2026-10-05"), 14);
  assert.equal(keyRateOn(k.changes, "2026-01-01"), null);
  assert.throws(() => parseKeyRate("<KeyRate></KeyRate>"), /no rows/);
});

test("RUONIA by the day it applies to, ascending", () => {
  const r = parseRuonia(fixture("ruonia.xml"));
  assert.equal(r.length, 11);
  assert.deepEqual(r[0], { date: "2026-09-21", pct: 14.09 });
  assert.deepEqual(r.at(-1), { date: "2026-10-05", pct: 13.77 });
});

test("the curve page gives the terms and a row of yields per date", () => {
  const c = parseCurve(fixture("curve.html"));
  assert.deepEqual(c.termsYears, [0.25, 0.5, 0.75, 1, 2, 3, 5, 7, 10, 15, 20, 30]);
  assert.equal(c.values.length, 21);
  assert.deepEqual(c.values.at(-1), { date: "2026-10-05", yieldsPct: [10.91, 12.04, 12.91, 13.58, 15.13, 15.81, 16.37, 16.61, 16.8, 16.94, 17.01, 17.07] });
  assert.ok(c.values.every((v, i) => i === 0 || v.date > c.values[i - 1].date));
  assert.throws(() => parseCurve("<main><table><tr><td>x</td></tr></table></main>"), /no table/);
});

test("the inflation page gives inflation, the target and the key rate by month", () => {
  const i = parseInflation(fixture("inflation.html"));
  assert.equal(i.length, 80);
  assert.deepEqual(i[0], { month: "2020-01", inflationPct: 2.4, targetPct: 4, keyRatePct: 6.25 });
  assert.deepEqual(i.at(-1), { month: "2026-08", inflationPct: 6.33, targetPct: 4, keyRatePct: 14 });
});

const read = () => ({
  keyRate: { text: fixture("key-rate.xml"), url: "https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx?op=KeyRateXML", retrievedAt: "2026-10-06T13:00:00.000Z", from: "2026-06-01", to: "2026-10-06" },
  ruonia: { text: fixture("ruonia.xml"), url: "https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx?op=RuoniaXML", retrievedAt: "2026-10-06T13:00:01.000Z", from: "2026-09-20", to: "2026-10-06" },
  curve: { text: fixture("curve.html"), url: pageUrl("https://www.cbr.ru/hd_base/zcyc_params/", "2026-09-05", "2026-10-06"), retrievedAt: "2026-10-06T13:00:02.000Z", from: "2026-09-05", to: "2026-10-06" },
  inflation: { text: fixture("inflation.html"), url: pageUrl("https://www.cbr.ru/hd_base/infl/", "2020-01-01", "2026-10-06"), retrievedAt: "2026-10-06T13:00:03.000Z", from: "2020-01-01", to: "2026-10-06" },
});

test("the snapshot names every source with its URL and retrieval time, credits the curve's calculator, and links cbr.ru", () => {
  const s = buildSnapshot(read(), "2026-10-06T13:00:04.000Z");
  assert.equal(s.terms, "https://www.cbr.ru/user_agreement/");
  assert.match(s.attribution, /https:\/\/www\.cbr\.ru\//);
  assert.match(s.attribution, /Moscow Exchange/);
  for (const part of [s.keyRate, s.ruonia, s.curve, s.inflation]) {
    assert.match(part.url, /^https:\/\/www\.cbr\.ru\//);
    assert.match(part.page, /^https:\/\/www\.cbr\.ru\/hd_base\//);
    assert.match(part.retrievedAt, /^\d{4}-\d{2}-\d{2}T/);
  }
  assert.equal(s.curve.url, "https://www.cbr.ru/hd_base/zcyc_params/?UniDbQuery.Posted=True&UniDbQuery.From=05.09.2026&UniDbQuery.To=06.10.2026");
  assert.deepEqual(s.curve.calculatedBy, { name: "Moscow Exchange", url: "https://www.moex.com/a3642" });
  assert.deepEqual(s.inflation.sources, ["Rosstat", "Bank of Russia"]);
  assert.deepEqual(s.latest, {
    date: "2026-10-05",
    keyRatePct: 14,
    ruoniaPct: 13.77,
    ruoniaDate: "2026-10-05",
    inflationPct: 6.33,
    inflationMonth: "2026-08",
    curve: { termsYears: [0.25, 0.5, 0.75, 1, 2, 3, 5, 7, 10, 15, 20, 30], yieldsPct: [10.91, 12.04, 12.91, 13.58, 15.13, 15.81, 16.37, 16.61, 16.8, 16.94, 17.01, 17.07] },
  });
});

test("an implausible figure stops the snapshot", () => {
  const r = read();
  r.ruonia.text = r.ruonia.text.replace("<ruo>13.7700</ruo>", "<ruo>137.7000</ruo>");
  assert.throws(() => buildSnapshot(r, "2026-10-06T13:00:04.000Z"), /RUONIA on 2026-10-05/);
});

test("the SOAP request names the method and the period", () => {
  const body = soapRequest("RuoniaXML", "2026-09-01", "2026-10-06");
  assert.match(body, /<RuoniaXML xmlns="http:\/\/web\.cbr\.ru\/"><fromDate>2026-09-01<\/fromDate><ToDate>2026-10-06<\/ToDate><\/RuoniaXML>/);
});

test("the committed snapshot is one the builder accepts, with its sources", () => {
  const s = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "data", "cbr", "snapshot.json"), "utf8"));
  assert.equal(s.schema, 1);
  assert.equal(s.terms, "https://www.cbr.ru/user_agreement/");
  for (const part of [s.keyRate, s.ruonia, s.curve, s.inflation]) {
    assert.match(part.url, /^https:\/\/www\.cbr\.ru\//);
    assert.ok(!Number.isNaN(Date.parse(part.retrievedAt)));
  }
  assert.equal(s.latest.keyRatePct, keyRateOn(s.keyRate.changes, s.latest.date));
  assert.deepEqual(s.latest.curve.yieldsPct, s.curve.values.at(-1).yieldsPct);
});
