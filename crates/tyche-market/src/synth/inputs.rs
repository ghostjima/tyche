//! What the synthetic market is built on: the valuation date and the
//! Bank of Russia's figures for it (key rate, RUONIA, inflation and the
//! zero-coupon yield curve of federal loan bonds, which the Moscow
//! Exchange calculates).

/// The zero-coupon yield curve: yields in percent a year at terms in
/// years, ascending.
#[derive(Debug, Clone, PartialEq)]
pub struct Curve {
    pub terms_years: Vec<f64>,
    pub yields_pct: Vec<f64>,
}

impl Curve {
    /// The yield at a term, in percent: linear between the published
    /// terms, flat beyond the first and the last.
    pub fn at(&self, years: f64) -> f64 {
        let t = &self.terms_years;
        let y = &self.yields_pct;
        if t.is_empty() {
            return f64::NAN;
        }
        if years <= t[0] {
            return y[0];
        }
        for i in 1..t.len() {
            if years <= t[i] {
                let w = (years - t[i - 1]) / (t[i] - t[i - 1]);
                return y[i - 1] + w * (y[i] - y[i - 1]);
            }
        }
        y[y.len() - 1]
    }

    /// Terms ascending and positive, one finite yield per term.
    pub fn is_valid(&self) -> bool {
        !self.terms_years.is_empty()
            && self.terms_years.len() == self.yields_pct.len()
            && self.terms_years.windows(2).all(|w| w[0] < w[1])
            && self.terms_years[0] > 0.0
            && self.yields_pct.iter().all(|y| y.is_finite())
    }
}

/// The market a universe is generated for.
#[derive(Debug, Clone, PartialEq)]
pub struct Inputs {
    /// `YYYY-MM-DD`, a trading day.
    pub valuation_date: String,
    /// The Bank of Russia key rate, percent.
    pub key_rate_pct: f64,
    /// RUONIA, percent.
    pub ruonia_pct: f64,
    /// Consumer price inflation over twelve months, percent.
    pub inflation_pct: f64,
    pub curve: Curve,
}

/// The figures the tests and the digests are pinned to, as the Bank of
/// Russia published them (cbr.ru, read on 2026-10-06): the key rate on
/// 2026-10-05 (https://www.cbr.ru/hd_base/KeyRate/), RUONIA for
/// 2026-10-05 (https://www.cbr.ru/hd_base/ruonia/), inflation for
/// August 2026 (https://www.cbr.ru/hd_base/infl/, from Rosstat and the
/// Bank of Russia) and the zero-coupon yield curve of federal loan bonds
/// on 2026-10-05 (https://www.cbr.ru/hd_base/zcyc_params/, calculated by
/// the Moscow Exchange). The app passes the snapshot it is built with.
pub fn fallback() -> Inputs {
    Inputs {
        valuation_date: "2026-10-05".into(),
        key_rate_pct: 14.0,
        ruonia_pct: 13.77,
        inflation_pct: 6.33,
        curve: Curve {
            terms_years: vec![
                0.25, 0.5, 0.75, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0,
            ],
            yields_pct: vec![
                10.91, 12.04, 12.91, 13.58, 15.13, 15.81, 16.37, 16.61, 16.80, 16.94, 17.01, 17.07,
            ],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_curve_interpolates_linearly_and_stays_flat_outside() {
        let c = fallback().curve;
        assert!(c.is_valid());
        assert_eq!(c.at(0.1), 10.91);
        assert_eq!(c.at(40.0), 17.07);
        assert_eq!(c.at(1.0), 13.58);
        assert!((c.at(1.5) - (13.58 + 15.13) / 2.0).abs() < 1e-12);
    }
}
