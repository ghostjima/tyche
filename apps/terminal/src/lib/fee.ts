// The broker's fee: one value for the session, in percent of each trade,
// shared by the issue card's yield, the calculator and the comparison,
// and kept in the URL (?fee=) so a shared link reproduces the figures.
import { COMMISSION_PCT } from "@tyche/yield-twin";

/** The fee when the link names none: the engine's usual one. */
export const FEE_DEFAULT = COMMISSION_PCT;
/** The range the field accepts, percent, and the arrow keys' stride. */
export const FEE_MIN = 0;
export const FEE_MAX = 1;
export const FEE_STEP = 0.01;

/** Whether a fee is one the terminal computes with: a number from
 * FEE_MIN to FEE_MAX. The engine itself refuses only a fee that is not a
 * finite number of at least zero (invalid_fee). */
export function feeInRange(fee: number): boolean {
  return Number.isFinite(fee) && fee >= FEE_MIN && fee <= FEE_MAX;
}

/** The fee in ?fee=, as written ("0.1"); anything that is not a number
 * is NaN, so the field and the engine say why. Absent, the default. */
export function readFee(params: URLSearchParams): number {
  const raw = params.get("fee");
  if (raw === null) return FEE_DEFAULT;
  const text = raw.trim();
  return text === "" ? Number.NaN : Number(text);
}

/** Writes the fee to ?fee=, or leaves it out at the default, as the other
 * parts of the URL leave out theirs. */
export function writeFee(params: URLSearchParams, fee: number): void {
  if (fee === FEE_DEFAULT) params.delete("fee");
  else params.set("fee", String(fee));
}
