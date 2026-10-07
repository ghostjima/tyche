/*
  Where a term falls on a curve of ascending terms: the index of the
  published term at or below it, of the term above it, and the weight of the
  term above (0 to 1). At or before the first term both indices are the
  first; beyond the last, both are the last, so the curve is held flat there.
  null when there are no terms or the term is NaN.
*/
export function curveBracket(termsYears: ArrayLike<number>, years: number): [number, number, number] | null {
  const n = termsYears.length;
  if (n === 0 || Number.isNaN(years)) return null;
  if (years <= (termsYears[0] as number)) return [0, 0, 0];
  for (let i = 1; i < n; i++) {
    const hi = termsYears[i] as number;
    if (years <= hi) {
      const lo = termsYears[i - 1] as number;
      return [i - 1, i, (years - lo) / (hi - lo)];
    }
  }
  return [n - 1, n - 1, 0];
}
