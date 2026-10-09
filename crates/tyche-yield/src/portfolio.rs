//! Personal income tax on a portfolio: the holdings' tax years, as
//! [`explain`](crate::explain) traces them for each holding, combined into
//! one base per calendar year, so the holdings share the threshold of the
//! 13 percent rate and a loss on one holding is netted against the income
//! of the others.
//!
//! The rules, from the Tax Code of the Russian Federation, part two, as
//! amended up to the Federal Law of 4 August 2026 (the revision in force
//! from 2026-10-01):
//!
//! - article 214.1, paragraph 7: coupons received in the year are income
//!   from operations with securities, with the income from redemptions and
//!   sales;
//! - article 214.1, paragraph 12: the negative result of separate
//!   operations with securities reduces the result of all such operations
//!   in the year, within each group of paragraph 1 (every issue here
//!   trades on the organised market, one group);
//! - article 214.1, paragraph 14: the base is the positive result of the
//!   year; a negative one is taxed at zero;
//! - article 219.1, paragraph 1, subparagraph 1, and paragraph 2: the
//!   positive result of disposals held more than three years is exempt up
//!   to 3,000,000 roubles times the coefficient Kцб, the average of the
//!   full years held weighted by the proceeds Vi of the disposals whose
//!   result is positive;
//! - article 210, paragraph 6, and article 224, paragraph 1.1: 13 percent
//!   while the sum of the bases of paragraph 6 (securities, dividends,
//!   deposit interest and the others listed there) is at most 2.4 million
//!   roubles in the year, 15 percent on the part above.
//!
//! Not modelled: losses of earlier years carried forward (article 214.1,
//! paragraph 16, and article 220.1: only through a tax declaration, so a
//! year's negative result is not carried to the next year here),
//! individual investment accounts (articles 219.1 and 219.2), and the
//! holdings' brokers: the portfolio is taken as one ordinary brokerage
//! account.

use crate::calculate::{TaxYear, LDV_CAP_PER_YEAR};
use crate::issue::Error;
use crate::primitives::{income_tax, max_nan, min_nan, TAX_THRESHOLD};

/// One holding's tax year: the parts of a [`TaxYear`] the portfolio's tax
/// is built from. Amounts are for the whole holding, in currency units.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct HoldingYear {
    pub year: i64,
    /// Coupons less the accrued interest deducted, plus reinvestment
    /// income.
    pub income: f64,
    /// Result of the redemptions and the sale outside the long-term
    /// holding relief.
    pub result: f64,
    /// Result of the disposals under the long-term holding relief.
    pub relieved: f64,
    /// Vi: what the relieved disposals at a gain returned.
    pub relieved_proceeds: f64,
    /// `relieved_proceeds` weighted by the full years each disposal was
    /// held.
    pub relieved_years: f64,
}

impl From<&TaxYear> for HoldingYear {
    fn from(t: &TaxYear) -> HoldingYear {
        HoldingYear {
            year: t.year,
            income: t.income,
            result: t.result,
            relieved: t.relieved,
            relieved_proceeds: t.relieved_proceeds,
            relieved_years: t.relieved_years,
        }
    }
}

/// One calendar year of the portfolio's tax. Amounts are for the whole
/// portfolio, in currency units.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PortfolioYear {
    pub year: i64,
    /// The holdings' tax years in this year.
    pub holdings: u32,
    /// The holdings' income: coupons less the accrued interest deducted,
    /// plus reinvestment income.
    pub income: f64,
    /// The holdings' results outside the relief, summed: a loss on one
    /// holding reduces the others' income and gains.
    pub result: f64,
    /// The holdings' results under the relief, summed.
    pub relieved: f64,
    /// Vi summed: the proceeds of the holdings' relieved disposals at a
    /// gain, whatever each holding's relieved result.
    pub relieved_proceeds: f64,
    /// The same proceeds weighted by the full years held.
    pub relieved_years: f64,
    /// The relief's limit: [`LDV_CAP_PER_YEAR`] times Kцб,
    /// `relieved_years / relieved_proceeds`; zero when nothing is relieved
    /// at a gain.
    pub relief_cap: f64,
    /// The part of `relieved` the relief exempts: `relieved` up to
    /// `relief_cap` when `relieved` is positive, zero otherwise.
    pub exempt: f64,
    /// `income + result + relieved - exempt`; taxed at zero when negative.
    pub base: f64,
    /// The part of the base taxed at
    /// [`TAX_RATE_PCT`](crate::primitives::TAX_RATE_PCT): what fits under
    /// [`TAX_THRESHOLD`] with the holder's other investment income.
    pub taxed_low: f64,
    /// The part taxed at
    /// [`TAX_HIGHER_RATE_PCT`](crate::primitives::TAX_HIGHER_RATE_PCT).
    pub taxed_high: f64,
    pub tax: f64,
}

/// The tax of a portfolio, year by year, in ascending years: every
/// holding's tax years (in any order, several holdings and years mixed)
/// combined into one base per calendar year, with the holder's other
/// investment income in each year. No holdings give no years.
///
/// The relief's coefficient counts every holding's Vi, the proceeds of its
/// relieved disposals at a gain, so a holding whose relieved result is a
/// loss still adds the disposals of it that gained.
///
/// [`Error::InvalidOtherIncome`] for other income that is not a finite
/// number of at least zero, then [`Error::InvalidTaxYear`] for a holding's
/// year with an amount that is not finite, or relieved proceeds or years
/// below zero.
pub fn portfolio_tax(
    holdings: &[HoldingYear],
    other_income: f64,
) -> Result<Vec<PortfolioYear>, Error> {
    if !(other_income.is_finite() && other_income >= 0.0) {
        return Err(Error::InvalidOtherIncome);
    }
    for h in holdings {
        let amounts = [
            h.income,
            h.result,
            h.relieved,
            h.relieved_proceeds,
            h.relieved_years,
        ];
        if amounts.iter().any(|a| !a.is_finite())
            || h.relieved_proceeds < 0.0
            || h.relieved_years < 0.0
        {
            return Err(Error::InvalidTaxYear);
        }
    }
    let mut years: Vec<PortfolioYear> = Vec::new();
    for h in holdings {
        let i = match years.iter().position(|y| y.year == h.year) {
            Some(i) => i,
            None => {
                years.push(PortfolioYear {
                    year: h.year,
                    ..PortfolioYear::default()
                });
                years.len() - 1
            }
        };
        let y = &mut years[i];
        y.holdings += 1;
        y.income += h.income;
        y.result += h.result;
        y.relieved += h.relieved;
        y.relieved_proceeds += h.relieved_proceeds;
        y.relieved_years += h.relieved_years;
    }
    years.sort_by_key(|y| y.year);
    for y in &mut years {
        if y.relieved > 0.0 && y.relieved_proceeds > 0.0 {
            y.relief_cap = LDV_CAP_PER_YEAR * y.relieved_years / y.relieved_proceeds;
            y.exempt = min_nan(y.relieved, y.relief_cap);
        }
        y.base = y.income + y.result + y.relieved - y.exempt;
        let taxed = max_nan(y.base, 0.0);
        y.taxed_low = min_nan(max_nan(TAX_THRESHOLD - other_income, 0.0), taxed);
        y.taxed_high = taxed - y.taxed_low;
        y.tax = income_tax(y.base, other_income);
    }
    Ok(years)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(year: i64, income: f64, result: f64) -> HoldingYear {
        HoldingYear {
            year,
            income,
            result,
            ..HoldingYear::default()
        }
    }

    #[test]
    fn a_loss_on_one_holding_reduces_the_tax_on_another() {
        // 100,000 of coupons and a 50,000 loss on a redemption elsewhere:
        // 13 percent of 50,000.
        let y = portfolio_tax(&[h(2027, 100_000.0, 0.0), h(2027, 0.0, -50_000.0)], 0.0).unwrap();
        assert_eq!(y.len(), 1);
        assert_eq!((y[0].holdings, y[0].base, y[0].tax), (2, 50_000.0, 6_500.0));
    }

    #[test]
    fn a_loss_is_not_carried_to_the_next_year() {
        let y = portfolio_tax(&[h(2028, 10_000.0, 0.0), h(2027, 0.0, -40_000.0)], 0.0).unwrap();
        assert_eq!(y.iter().map(|y| y.year).collect::<Vec<_>>(), [2027, 2028]);
        assert_eq!((y[0].base, y[0].tax), (-40_000.0, 0.0));
        assert_eq!((y[1].base, y[1].tax), (10_000.0, 1_300.0));
    }

    #[test]
    fn invalid_inputs_are_errors() {
        assert_eq!(portfolio_tax(&[], -1.0), Err(Error::InvalidOtherIncome));
        assert_eq!(portfolio_tax(&[], f64::NAN), Err(Error::InvalidOtherIncome));
        assert_eq!(
            portfolio_tax(&[h(2027, f64::NAN, 0.0)], 0.0),
            Err(Error::InvalidTaxYear)
        );
        let mut bad = h(2027, 0.0, 0.0);
        bad.relieved_proceeds = -1.0;
        assert_eq!(portfolio_tax(&[bad], 0.0), Err(Error::InvalidTaxYear));
        assert_eq!(portfolio_tax(&[], 0.0), Ok(vec![]));
    }
}
