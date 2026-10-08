//! Placements: new issues of the universe's fictional issuers, placed by
//! book-building around the valuation date. Each has a book that takes
//! requests between two working days, a coupon guidance range, and,
//! once the book has closed, the final coupon and how much of a request
//! was allotted. Everything is drawn from the universe's seed and the
//! zero-coupon curve, so it is the same on every platform; nothing here
//! is a real placement.
//!
//! Rules of the synthetic universe, stated so the screen can say them:
//!
//! - Working days are Monday to Friday, as for the events.
//! - The guidance is a coupon range. Its top is the coupon whose yield
//!   is the zero-coupon curve at the issue's term, plus the issuer's
//!   credit and sector spreads and a new-issue premium; the range is
//!   [`GUIDANCE_STEP_PCT`] apart steps below it.
//! - The book's demand is the requests over the size offered, a draw of
//!   the scenario. The final coupon falls from the top of the guidance
//!   towards its bottom as demand grows: at the top with demand of the
//!   size or less, at the bottom from [`FULL_DEMAND`] times the size,
//!   linearly between, on the guidance's step.
//! - Allotment is pro rata: a request without a coupon limit gets the
//!   size over the demand, all of it when the book is not covered.
//! - The issue settles [`SETTLES_AFTER`] working days after the book
//!   closes.

use super::det;
use super::events::working_days_from;
use super::rng::{derive, Rng};
use super::universe::{iso, rating_spread_pct, Segment, Universe};
use tyche_yield::date::parse_iso_date;

/// Placements the universe has around its valuation date.
pub const PLACEMENTS: usize = 4;
/// Coupon guidance is set, and the final coupon falls, in steps of this
/// many percentage points.
pub const GUIDANCE_STEP_PCT: f64 = 0.05;
/// Demand, as a multiple of the size, at which the final coupon reaches
/// the bottom of the guidance.
pub const FULL_DEMAND: f64 = 2.5;
/// Working days from the book's close to the settlement.
pub const SETTLES_AFTER: i64 = 3;
/// The request the screen's allotment speaks of, roubles of face value.
pub const INDICATIVE_REQUEST: f64 = 1_000_000.0;

/// Where a book stands on the valuation date.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BookState {
    /// Opens after the valuation date.
    Upcoming,
    /// Takes requests on the valuation date.
    Open,
    /// Closed before the valuation date: the final coupon is set.
    Closed,
}

impl BookState {
    pub fn code(self) -> &'static str {
        match self {
            BookState::Upcoming => "upcoming",
            BookState::Open => "open",
            BookState::Closed => "closed",
        }
    }
}

/// A placement. Days are offsets from the valuation date; coupons are
/// percent a year.
#[derive(Debug, Clone, PartialEq)]
pub struct Placement {
    pub ticker: String,
    /// Index into the universe's issuers.
    pub issuer: usize,
    /// Index into [`super::RATINGS`]: the issuer's.
    pub rating: usize,
    pub state: BookState,
    /// The book's first and last working days.
    pub book_open: i64,
    pub book_close: i64,
    pub settlement: i64,
    /// `YYYY-MM-DD`.
    pub maturity: String,
    pub term_years: u32,
    pub period_days: f64,
    /// Face value offered, roubles.
    pub size: f64,
    pub guidance_low_pct: f64,
    pub guidance_high_pct: f64,
    /// Once the book has closed: the requests over the size, the final
    /// coupon, and the share of a request without a coupon limit that was
    /// allotted, percent.
    pub demand: Option<f64>,
    pub final_coupon_pct: Option<f64>,
    pub allotted_pct: Option<f64>,
}

/// On the guidance's step.
fn on_step(pct: f64) -> f64 {
    (pct / GUIDANCE_STEP_PCT).round() * GUIDANCE_STEP_PCT
}

/// The coupon, percent a year, paid every `period_days`, whose annual
/// effective yield at par is `yield_pct`.
fn coupon_for(yield_pct: f64, period_days: f64) -> f64 {
    let per_year = 365.0 / period_days;
    let growth = det::exp(det::ln(1.0 + yield_pct / 100.0) / per_year);
    100.0 * per_year * (growth - 1.0)
}

/// The final coupon for a book's demand, on the guidance's step.
pub fn final_coupon(low: f64, high: f64, demand: f64) -> f64 {
    let t = ((demand - 1.0) / (FULL_DEMAND - 1.0)).clamp(0.0, 1.0);
    on_step(high - (high - low) * t)
}

/// The share of a request without a coupon limit that is allotted,
/// percent, to a tenth.
pub fn allotted(demand: f64) -> f64 {
    let share = if demand <= 1.0 { 1.0 } else { 1.0 / demand };
    (share * 1000.0).round() / 10.0
}

/// The universe's placements, by the book's first day.
pub fn placements(u: &Universe) -> Vec<Placement> {
    let Some(today) = parse_iso_date(&u.inputs.valuation_date) else {
        return Vec::new();
    };
    let mut r = Rng::new(derive(u.seed, &[7]));
    let day = |n: i64| working_days_from(today, n) - today;
    // Issuers rated BB or better, each once.
    let eligible: Vec<usize> = (1..u.issuers.len())
        .filter(|&i| u.issuers[i].rating <= 11)
        .collect();
    let mut chosen: Vec<usize> = Vec::new();
    while chosen.len() < PLACEMENTS.min(eligible.len()) {
        let i = *r.pick(&eligible);
        if !chosen.contains(&i) {
            chosen.push(i);
        }
    }
    let mut out: Vec<Placement> = chosen
        .into_iter()
        .enumerate()
        .map(|(k, issuer)| place(u, &mut r, &day, today, k, issuer))
        .collect();
    out.sort_by_key(|p| p.book_open);
    out
}

fn place(
    u: &Universe,
    r: &mut Rng,
    day: &dyn Fn(i64) -> i64,
    today: i64,
    k: usize,
    issuer: usize,
) -> Placement {
    let s = &u.issuers[issuer];
    // One book closed a few days ago, two open (one closing soon), one
    // still to open.
    let (state, open, close) = match k {
        0 => {
            let close = -(2 + r.below(4) as i64);
            (
                BookState::Closed,
                day(close - 1 - r.below(3) as i64),
                day(close),
            )
        }
        1 => (
            BookState::Open,
            day(-(1 + r.below(3) as i64)),
            day(4 + r.below(4) as i64),
        ),
        2 => (
            BookState::Open,
            day(-(r.below(2) as i64)),
            day(1 + r.below(2) as i64),
        ),
        _ => {
            let open = 6 + r.below(8) as i64;
            (
                BookState::Upcoming,
                day(open),
                day(open + 1 + r.below(3) as i64),
            )
        }
    };
    let settlement = working_days_from(today + close, SETTLES_AFTER) - today;
    let term_years = *r.pick(&[1u32, 2, 2, 3, 3, 4, 5]);
    let period_days = *r.pick(&[30.0, 91.0, 91.0, 182.0]);
    let size = *r.pick(&[3.0, 5.0, 5.0, 10.0, 15.0, 20.0]) * 1e9;
    let premium = r.range(0.3, 0.8);
    let top_yield = u.inputs.curve.at(term_years as f64)
        + rating_spread_pct(s.rating)
        + s.sector.spread_pct()
        + premium;
    let high = on_step(coupon_for(top_yield, period_days));
    let low = high - GUIDANCE_STEP_PCT * (10 + r.below(11)) as f64;
    let demand =
        (state == BookState::Closed).then(|| (r.log_range(0.8, 3.6) * 100.0).round() / 100.0);
    // The next series of the issuer.
    let series = u
        .issues
        .iter()
        .filter(|i| i.issuer == issuer && i.segment == Segment::Corporate)
        .count()
        + 1;
    Placement {
        ticker: format!("{}-{series:02}", s.code),
        issuer,
        rating: s.rating,
        state,
        book_open: open,
        book_close: close,
        settlement,
        maturity: iso(today + settlement + term_years as i64 * 365),
        term_years,
        period_days,
        size,
        guidance_low_pct: low,
        guidance_high_pct: high,
        demand,
        final_coupon_pct: demand.map(|d| final_coupon(low, high, d)),
        allotted_pct: demand.map(allotted),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_final_coupon_falls_through_the_guidance_with_demand() {
        assert_eq!(final_coupon(14.0, 14.5, 0.9), 14.5);
        assert_eq!(final_coupon(14.0, 14.5, 1.0), 14.5);
        // Half way to full demand: half way down, on the step.
        assert!((final_coupon(14.0, 14.5, 1.75) - 14.25).abs() < 1e-9);
        assert!((final_coupon(14.0, 14.5, 2.5) - 14.0).abs() < 1e-9);
        assert!((final_coupon(14.0, 14.5, 9.0) - 14.0).abs() < 1e-9);
    }

    #[test]
    fn a_request_is_allotted_pro_rata_and_in_full_when_the_book_is_not_covered() {
        assert_eq!(allotted(0.8), 100.0);
        assert_eq!(allotted(1.0), 100.0);
        assert_eq!(allotted(2.0), 50.0);
        assert_eq!(allotted(3.0), 33.3);
    }

    #[test]
    fn a_coupon_paid_more_often_is_lower_for_the_same_yield() {
        let annual = coupon_for(15.0, 365.0);
        assert!((annual - 15.0).abs() < 1e-9);
        let quarterly = coupon_for(15.0, 91.0);
        let monthly = coupon_for(15.0, 30.0);
        assert!(monthly < quarterly && quarterly < annual);
        // 15 percent effective is about 14.2 percent paid quarterly.
        assert!((quarterly - 14.2).abs() < 0.05);
    }
}
