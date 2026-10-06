// When an issue counts as liquid in the synthetic market: thresholds on
// its quoted spread and on the depth of its order book, named here and
// written into the interface's text, so the filter and the warning say
// what they check.
import type { Bond } from "../data/issues";

/** The widest quoted spread, in basis points of the mid price, of an
 * issue that counts as liquid: buying and selling back at once costs at
 * most half a percent of the price. */
export const LIQUID_MAX_SPREAD_BP = 50;

/** The thinnest visible depth per side of the book, in bonds, of an issue
 * that counts as liquid. */
export const LIQUID_MIN_DEPTH = 10_000;

/** Whether an issue's synthetic book is within both thresholds. */
export function isLiquid(bond: Bond): boolean {
  return bond.liquidity.spreadBp <= LIQUID_MAX_SPREAD_BP && bond.liquidity.depth >= LIQUID_MIN_DEPTH;
}
