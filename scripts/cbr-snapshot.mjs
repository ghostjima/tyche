// Takes the Bank of Russia snapshot: the key rate history and RUONIA from
// the DailyInfo web service, the zero-coupon yield curve of federal loan
// bonds (calculated by the Moscow Exchange) and inflation from the cbr.ru
// database pages; writes one JSON with every figure's source URL and
// retrieval time. The Bank of Russia's terms (https://www.cbr.ru/user_agreement/)
// ask for a link to cbr.ru wherever its material is quoted; the snapshot
// carries it, and so does every screen that shows a figure from it.
//
//   node scripts/cbr-snapshot.mjs --out data/cbr/snapshot.json [--today YYYY-MM-DD]
//
// Exits non-zero, writing nothing, when a response cannot be read or a
// figure is missing or implausible.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PAGES, SERVICE, buildSnapshot, pageUrl, soapRequest } from "./cbr/snapshot.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const out = arg("--out");
if (!out) {
  console.error("usage: node scripts/cbr-snapshot.mjs --out <file> [--today YYYY-MM-DD]");
  process.exit(2);
}
const today = arg("--today") ?? new Date().toISOString().slice(0, 10);
const daysBefore = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const AGENT = "tyche-bonds-snapshot (+https://github.com/ghostjima/tyche)";

async function fetchText(url, init = {}) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { "User-Agent": AGENT, ...init.headers }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return { text: await res.text(), retrievedAt: new Date().toISOString() };
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
  throw last;
}

async function daily(method, from, to) {
  const r = await fetchText(SERVICE, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"http://web.cbr.ru/${method}"` },
    body: soapRequest(method, from, to),
  });
  // The operation's own page on the service, with the period asked for.
  return { ...r, url: `${SERVICE}?op=${method}`, from, to };
}

async function page(base, from, to) {
  const url = pageUrl(base, from, to);
  return { ...(await fetchText(url)), url, from, to };
}

// The key rate since it was introduced (13 September 2013); RUONIA over a
// year; the curve over a month; inflation since 2020.
const read = {
  keyRate: await daily("KeyRateXML", "2013-09-13", today),
  ruonia: await daily("RuoniaXML", daysBefore(today, 365), today),
  curve: await page(PAGES.curve, daysBefore(today, 31), today),
  inflation: await page(PAGES.inflation, "2020-01-01", today),
};
const snapshot = buildSnapshot(read, new Date().toISOString());
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
const l = snapshot.latest;
console.log(`${out}: curve ${l.date}, key rate ${l.keyRatePct}, RUONIA ${l.ruoniaPct} (${l.ruoniaDate}), inflation ${l.inflationPct} (${l.inflationMonth})`);
