//! The G-spread: how far an issue's yield sits above the zero-coupon
//! yield curve of federal loan bonds (OFZ) at the issue's Macaulay
//! duration.
//!
//! The curve is an input, as the Bank of Russia publishes it
//! (<https://www.cbr.ru/hd_base/zcyc_params/>; the Moscow Exchange
//! calculates it): yields in percent a year at fixed terms in years. The
//! Exchange fits a continuously compounded rate `G(t)`, in basis points,
//! and publishes `Y(t) = exp(G(t) / 10000) - 1`, an annual effective
//! rate, which is the convention of this engine's yields (annual
//! effective, ACT/365), so the spread is the plain difference of the two
//! rates. The publication gives
//! the curve at its terms only, so between two terms the curve is read
//! linearly in the yield, and before the first term and after the last it
//! is held flat at that term's yield.

use crate::issue::{derive_bond, Error, Issue, Market, Schedule};
use crate::primitives::{curve_bracket, macaulay_duration};

/// A zero-coupon yield curve as published: yields in percent a year,
/// annual effective, at ascending terms in years.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Curve {
    pub terms_years: Vec<f64>,
    pub yields_pct: Vec<f64>,
}

impl Curve {
    /// [`Error::CurveMissing`] when the curve has neither terms nor yields;
    /// [`Error::InvalidCurve`] when the two lists differ in length, a term
    /// is not a finite number above zero, the terms do not strictly
    /// ascend, or a yield is not a finite number.
    pub fn check(&self) -> Result<(), Error> {
        let t = &self.terms_years;
        let y = &self.yields_pct;
        if t.is_empty() && y.is_empty() {
            return Err(Error::CurveMissing);
        }
        let terms_ok =
            t.iter().all(|x| x.is_finite() && *x > 0.0) && t.windows(2).all(|w| w[0] < w[1]);
        if t.len() != y.len() || !terms_ok || !y.iter().all(|x| x.is_finite()) {
            return Err(Error::InvalidCurve);
        }
        Ok(())
    }
}

/// The G-spread of a yield to one event (maturity, or redemption at the
/// offer), worked out.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GSpread {
    /// Macaulay duration of the flows to the event at the yield to it, in
    /// years.
    pub duration_years: f64,
    /// The yield to the event, percent a year, annual effective.
    pub yield_pct: f64,
    /// The published term at or below the duration and its yield; the
    /// first term when the duration is at or before it, the last when it
    /// is beyond the last.
    pub term_below_years: f64,
    pub yield_below_pct: f64,
    /// The published term above the duration and its yield; the same term
    /// as below where the curve is held flat.
    pub term_above_years: f64,
    pub yield_above_pct: f64,
    /// The curve's yield at the duration, percent a year: the yield below
    /// plus the share of the way from the term below to the term above,
    /// `(duration_years - term_below_years) / (term_above_years -
    /// term_below_years)`, of the step between their yields; the term's
    /// own yield where the curve is held flat.
    pub curve_pct: f64,
    /// `(yield_pct - curve_pct) * 100`, in basis points.
    pub spread_bp: f64,
}

/// The G-spreads of an issue's yields to maturity and to the offer.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GSpreads {
    pub to_maturity: GSpread,
    /// Issues with an offer after the valuation date only.
    pub to_offer: Option<GSpread>,
}

/// The G-spread of a yield (a fraction) to the event the flows end on.
/// The curve must have passed [`Curve::check`]. A yield that is NaN (a
/// price that is not positive) gives NaN figures.
pub(crate) fn spread_of(flows: &Schedule, ytm: f64, curve: &Curve) -> GSpread {
    let duration_years = macaulay_duration(&flows.amounts(), &flows.days, ytm);
    let yield_pct = ytm * 100.0;
    let t = &curve.terms_years;
    let y = &curve.yields_pct;
    let (term_below_years, yield_below_pct, term_above_years, yield_above_pct, curve_pct) =
        match curve_bracket(t, duration_years) {
            None => (f64::NAN, f64::NAN, f64::NAN, f64::NAN, f64::NAN),
            Some((lo, hi, _)) if lo == hi => (t[lo], y[lo], t[hi], y[hi], y[lo]),
            Some((lo, hi, w)) => (t[lo], y[lo], t[hi], y[hi], y[lo] + w * (y[hi] - y[lo])),
        };
    GSpread {
        duration_years,
        yield_pct,
        term_below_years,
        yield_below_pct,
        term_above_years,
        yield_above_pct,
        curve_pct,
        spread_bp: (yield_pct - curve_pct) * 100.0,
    }
}

/// The G-spreads of an issue's yields to maturity and to the nearest
/// offer, each at the Macaulay duration of its own flows, against a
/// zero-coupon curve. Errors as [`derive_bond`], then the curve's
/// ([`Curve::check`]).
pub fn g_spread(issue: &Issue, market: &Market, curve: &Curve) -> Result<GSpreads, Error> {
    let d = derive_bond(issue, market)?;
    curve.check()?;
    Ok(GSpreads {
        to_maturity: spread_of(&d.flows, d.ytm_maturity, curve),
        to_offer: match (&d.flows_to_offer, d.ytm_offer) {
            (Some(flows), Some(ytm)) => Some(spread_of(flows, ytm, curve)),
            _ => None,
        },
    })
}
