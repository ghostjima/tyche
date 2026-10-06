// The Bank of Russia snapshot: every figure with the URL it was read from
// and when, the attribution the Bank of Russia's terms ask for, and the
// figures of the latest curve date, which the app builds its market on.
import { keyRateOn, parseCurve, parseInflation, parseKeyRate, parseRuonia } from "./parse.mjs";

export const SERVICE = "https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx";
export const PAGES = {
  keyRate: "https://www.cbr.ru/hd_base/KeyRate/",
  ruonia: "https://www.cbr.ru/hd_base/ruonia/",
  curve: "https://www.cbr.ru/hd_base/zcyc_params/",
  inflation: "https://www.cbr.ru/hd_base/infl/",
};
export const TERMS = "https://www.cbr.ru/user_agreement/";
/** Where the Moscow Exchange describes the curve it calculates. */
export const CURVE_CALCULATOR = { name: "Moscow Exchange", url: "https://www.moex.com/a3642" };

/** A cbr.ru database page for a period, as the page's own form asks for
 * it (dates as DD.MM.YYYY). */
export function pageUrl(page, from, to) {
  const ru = (iso) => iso.split("-").reverse().join(".");
  return `${page}?UniDbQuery.Posted=True&UniDbQuery.From=${ru(from)}&UniDbQuery.To=${ru(to)}`;
}

/** The SOAP 1.1 request DailyInfo takes for a method with a period. */
export function soapRequest(method, from, to) {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="http://web.cbr.ru/"><fromDate>${from}</fromDate><ToDate>${to}</ToDate></${method}></soap:Body></soap:Envelope>`;
}

const inRange = (what, x, lo, hi) => {
  if (!(Number.isFinite(x) && x >= lo && x <= hi)) throw new Error(`${what}: ${x} is outside ${lo} to ${hi}`);
};

/**
 * Builds the snapshot from the four responses. `read` holds each
 * response's text, the URL it came from and when it was read:
 * `{ keyRate, ruonia, curve, inflation }`, each `{ text, url, retrievedAt,
 * from, to }`. Throws when a figure is missing or implausible.
 */
export function buildSnapshot(read, retrievedAt) {
  const key = parseKeyRate(read.keyRate.text);
  const ruonia = parseRuonia(read.ruonia.text);
  const curve = parseCurve(read.curve.text);
  const inflation = parseInflation(read.inflation.text);

  for (const c of key.changes) inRange(`key rate from ${c.from}`, c.pct, 0, 100);
  for (const r of ruonia) inRange(`RUONIA on ${r.date}`, r.pct, 0, 100);
  for (const v of curve.values) for (const y of v.yieldsPct) inRange(`curve on ${v.date}`, y, 0, 100);
  for (const v of inflation) inRange(`inflation in ${v.month}`, v.inflationPct, -20, 100);
  if (!curve.termsYears.every((t, i) => t > 0 && (i === 0 || t > curve.termsYears[i - 1]))) throw new Error("curve: terms are not ascending");

  const last = curve.values[curve.values.length - 1];
  const keyPct = keyRateOn(key.changes, last.date);
  if (keyPct === null) throw new Error(`no key rate on ${last.date}`);
  const ruoniaOn = [...ruonia].reverse().find((r) => r.date <= last.date);
  if (!ruoniaOn) throw new Error(`no RUONIA on or before ${last.date}`);
  const infl = inflation[inflation.length - 1];

  const source = (r, extra) => ({ url: r.url, retrievedAt: r.retrievedAt, from: r.from, to: r.to, ...extra });
  return {
    schema: 1,
    publisher: "Bank of Russia",
    site: "https://www.cbr.ru/",
    terms: TERMS,
    attribution:
      "Source: Bank of Russia (https://www.cbr.ru/). The zero-coupon yield curve of federal loan bonds is calculated by the Moscow Exchange (https://www.moex.com/a3642). Inflation: Rosstat and the Bank of Russia.",
    retrievedAt,
    keyRate: source(read.keyRate, { page: PAGES.keyRate, method: "KeyRateXML", changes: key.changes }),
    ruonia: source(read.ruonia, { page: PAGES.ruonia, method: "RuoniaXML", values: ruonia }),
    curve: source(read.curve, { page: PAGES.curve, calculatedBy: CURVE_CALCULATOR, termsYears: curve.termsYears, values: curve.values }),
    inflation: source(read.inflation, { page: PAGES.inflation, sources: ["Rosstat", "Bank of Russia"], values: inflation }),
    latest: {
      date: last.date,
      keyRatePct: keyPct,
      ruoniaPct: ruoniaOn.pct,
      ruoniaDate: ruoniaOn.date,
      inflationPct: infl.inflationPct,
      inflationMonth: infl.month,
      curve: { termsYears: curve.termsYears, yieldsPct: last.yieldsPct },
    },
  };
}
