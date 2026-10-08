/*
  portfolio_tax: the tax of several holdings together. Each holding's tax
  years, as explain traces them, are combined into one base per calendar
  year: the holdings share the threshold of the 13 percent rate, and a
  loss on one holding is netted against the income of the others. Tax Code
  of the Russian Federation, part two, as amended up to the Federal Law of
  4 August 2026 (in force from 2026-10-01): article 214.1, paragraphs 7
  (coupons are income from operations with securities), 12 (a negative
  result of separate operations reduces the result of all of them) and 14
  (the base is the year's positive result); article 219.1, paragraph 1,
  subparagraph 1, and paragraph 2 (the long-term holding relief, up to 3
  million times Kцб, the full years held weighted by the proceeds Vi of the
  disposals that gain); article 210, paragraph 6, and article 224,
  paragraph 1.1 (13 percent up to 2.4 million a year across those bases, 15
  above). Losses carried forward from earlier years (article 214.1,
  paragraph 16, and article 220.1) and individual investment accounts are
  not modelled.
*/

import { LDV_CAP_PER_YEAR } from "./calculate.js";
import { TAX_THRESHOLD, income_tax } from "./primitives.js";
import type { HoldingYear, PortfolioYear, Result } from "./types.js";

const finite = (x: number) => typeof x === "number" && Number.isFinite(x);

/*
  The portfolio's tax year by year, in ascending years, from every
  holding's tax years in any order. A holding's relieved proceeds count in
  the relief's coefficient in a year when its relieved result is positive.
  Errors: invalid_other_income first, then invalid_tax_year (an amount not
  finite, relieved proceeds or years below zero, a year not a whole number).
*/
export function portfolio_tax(holdings: readonly HoldingYear[], otherIncome: number): Result<PortfolioYear[]> {
  if (!(finite(otherIncome) && otherIncome >= 0)) return { error: "invalid_other_income" };
  for (const h of holdings) {
    const amounts = [h.income, h.result, h.relieved, h.relievedProceeds, h.relievedYears];
    if (!Number.isInteger(h.year) || !amounts.every(finite) || h.relievedProceeds < 0 || h.relievedYears < 0) {
      return { error: "invalid_tax_year" };
    }
  }
  const byYear = new Map<number, PortfolioYear>();
  for (const h of holdings) {
    let y = byYear.get(h.year);
    if (!y) {
      y = {
        year: h.year,
        holdings: 0,
        income: 0,
        result: 0,
        relieved: 0,
        relievedProceeds: 0,
        relievedYears: 0,
        reliefCap: 0,
        exempt: 0,
        base: 0,
        taxedLow: 0,
        taxedHigh: 0,
        tax: 0,
      };
      byYear.set(h.year, y);
    }
    y.holdings += 1;
    y.income += h.income;
    y.result += h.result;
    y.relieved += h.relieved;
    if (h.relieved > 0) {
      y.relievedProceeds += h.relievedProceeds;
      y.relievedYears += h.relievedYears;
    }
  }
  const years = [...byYear.values()].sort((a, b) => a.year - b.year);
  for (const y of years) {
    if (y.relieved > 0 && y.relievedProceeds > 0) {
      y.reliefCap = (LDV_CAP_PER_YEAR * y.relievedYears) / y.relievedProceeds;
      y.exempt = Math.min(y.relieved, y.reliefCap);
    }
    y.base = y.income + y.result + y.relieved - y.exempt;
    const taxed = Math.max(y.base, 0);
    y.taxedLow = Math.min(Math.max(TAX_THRESHOLD - otherIncome, 0), taxed);
    y.taxedHigh = taxed - y.taxedLow;
    y.tax = income_tax(y.base, otherIncome);
  }
  return { ok: years };
}
