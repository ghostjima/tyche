// The holdings of a synthetic portfolio, kept in the URL so a link
// carries them: `?hold=KAMF-01*30` once per issue, the ticker and the
// bonds held. Nothing is stored anywhere else.

/** An issue held, by ticker, and the bonds held. */
export type Holding = { id: string; bonds: number };

/** The most holdings a portfolio keeps. */
export const HOLDINGS_MAX = 20;
/** The most bonds of one issue. */
export const BONDS_MAX = 1_000_000;

const TICKER = /^[A-Z0-9-]{1,8}$/;

/** A whole number of bonds from 1 to BONDS_MAX. */
export const validBonds = (n: number) => Number.isInteger(n) && n >= 1 && n <= BONDS_MAX;

/** The holdings in `?hold=`, in their order, once per ticker (the last
 * one given wins), at most HOLDINGS_MAX; a part that is not a ticker and
 * a whole number of bonds is left out. */
export function readHoldings(params: URLSearchParams): Holding[] {
  const out: Holding[] = [];
  for (const part of params.getAll("hold")) {
    const star = part.lastIndexOf("*");
    if (star < 1) continue;
    const id = part.slice(0, star);
    const bonds = Number(part.slice(star + 1));
    if (!TICKER.test(id) || !/^\d+$/.test(part.slice(star + 1)) || !validBonds(bonds)) continue;
    const at = out.findIndex((h) => h.id === id);
    if (at >= 0) out.splice(at, 1);
    out.push({ id, bonds });
  }
  return out.slice(0, HOLDINGS_MAX);
}

/** Writes the holdings to `?hold=`, replacing what was there. */
export function writeHoldings(params: URLSearchParams, holdings: readonly Holding[]): void {
  params.delete("hold");
  for (const h of holdings) params.append("hold", `${h.id}*${h.bonds}`);
}

/** Adds an issue or sets its bonds; a new one goes last. A full portfolio
 * takes no new issue. */
export function setHolding(holdings: readonly Holding[], id: string, bonds: number): Holding[] {
  const at = holdings.findIndex((h) => h.id === id);
  if (at >= 0) return holdings.map((h, i) => (i === at ? { id, bonds } : h));
  return holdings.length >= HOLDINGS_MAX ? [...holdings] : [...holdings, { id, bonds }];
}
