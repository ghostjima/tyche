// Parsers for the Bank of Russia's published figures: the DailyInfo web
// service's key rate and RUONIA responses (XML), and the cbr.ru database
// pages of the zero-coupon yield curve of federal loan bonds and of
// inflation (HTML tables). Pure functions on text, so the tests run them
// on saved responses. Each throws when the text does not have the shape
// it expects, so a change on cbr.ru stops the snapshot instead of writing
// a wrong one.

/** "05.10.2026" or "2026-10-05T00:00:00+03:00" as "2026-10-05". */
export function isoDate(text) {
  const s = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error(`not a date: ${text}`);
}

/** A number written with a decimal comma or point ("12,04", "14.00"). */
export function number(text) {
  const s = text.replace(/&nbsp;|\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`not a number: ${text}`);
  return Number(s);
}

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const cellText = (html) => decode(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

function rows(table) {
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/g)].map((c) => ({ head: c[1] === "h", text: cellText(c[2]) })));
}

function tables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
}

/** KeyRateXML: the key rate on each business day, as the changes only:
 * `[{ from, pct }]`, ascending, each the first day of a rate. */
export function parseKeyRate(xml) {
  const days = [...xml.matchAll(/<KR>\s*<DT>([^<]+)<\/DT>\s*<Rate>([^<]+)<\/Rate>\s*<\/KR>/g)].map((m) => ({ date: isoDate(m[1]), pct: number(m[2]) }));
  if (days.length === 0) throw new Error("KeyRateXML: no rows");
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const changes = [];
  for (const d of days) if (changes.length === 0 || changes[changes.length - 1].pct !== d.pct) changes.push({ from: d.date, pct: d.pct });
  return { changes, firstDay: days[0].date, lastDay: days[days.length - 1].date };
}

/** RuoniaXML: RUONIA by the day it applies to, ascending. */
export function parseRuonia(xml) {
  const days = [...xml.matchAll(/<ro>\s*<D0>([^<]+)<\/D0>\s*<ruo>([^<]+)<\/ruo>/g)].map((m) => ({ date: isoDate(m[1]), pct: number(m[2]) }));
  if (days.length === 0) throw new Error("RuoniaXML: no rows");
  return days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The curve page: the terms in years from the header, and the yields in
 * percent a year at each term for each date, ascending by date. */
export function parseCurve(html) {
  const table = tables(html).find((t) => /Срок до погашения/.test(t));
  if (!table) throw new Error("curve: no table with terms");
  const all = rows(table);
  const header = all.find((r) => r.length > 3 && r.every((c) => c.head) && r.every((c) => /^\d+([.,]\d+)?$/.test(c.text)));
  if (!header) throw new Error("curve: no row of terms");
  const termsYears = header.map((c) => number(c.text));
  const values = all
    .filter((r) => r.length === termsYears.length + 1 && !r[0].head)
    .map((r) => ({ date: isoDate(r[0].text), yieldsPct: r.slice(1).map((c) => number(c.text)) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (values.length === 0) throw new Error("curve: no rows of yields");
  return { termsYears, values };
}

/** The inflation page: by month ("2026-08"), consumer price inflation
 * over twelve months, the inflation target and the key rate on the
 * month's last day, percent; ascending by month. */
export function parseInflation(html) {
  const table = tables(html).find((t) => /Инфляция, % г\/г/.test(t));
  if (!table) throw new Error("inflation: no table");
  const all = rows(table);
  const head = all[0]?.map((c) => c.text) ?? [];
  const col = (re) => {
    const i = head.findIndex((h) => re.test(h));
    if (i < 0) throw new Error(`inflation: no column ${re}`);
    return i;
  };
  const [month, key, infl, target] = [col(/^Дата$/), col(/Ключевая ставка/), col(/Инфляция/), col(/Цель/)];
  const values = all.slice(1).map((r) => {
    const m = /^(\d{2})\.(\d{4})$/.exec(r[month]?.text ?? "");
    if (!m) throw new Error(`inflation: not a month: ${r[month]?.text}`);
    return { month: `${m[2]}-${m[1]}`, inflationPct: number(r[infl].text), targetPct: number(r[target].text), keyRatePct: number(r[key].text) };
  });
  if (values.length === 0) throw new Error("inflation: no rows");
  return values.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** The key rate in force on a date, from its changes. */
export function keyRateOn(changes, date) {
  let pct = null;
  for (const c of changes) if (c.from <= date) pct = c.pct;
  return pct;
}
