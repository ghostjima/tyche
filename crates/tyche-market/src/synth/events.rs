//! What happens to a holding of a synthetic issue, by date: its coupons,
//! amortisations and maturity, its offer with the window to act in, and
//! the universe's scenario of rating changes and defaults.
//!
//! The payments come from the issue's terms through tyche-yield, as the
//! engine schedules them; a floater's coupons are projected at today's
//! key rate (or RUONIA) and a linker's on today's indexed nominal, and
//! are marked as projected. Everything else is a scenario the synthetic
//! universe draws from its seed, one stream per issuer, and is marked as
//! such: nothing here happened to a real issuer.
//!
//! Rules of the synthetic universe, stated so the screen can say them:
//!
//! - Working days are Monday to Friday; no holiday calendar.
//! - A put offer's window: the holder asks for redemption at the offer on
//!   one of the [`PUT_WINDOW_DAYS`] working days that end
//!   [`PUT_WINDOW_ENDS_BEFORE`] working days before the offer date; the
//!   window's last day is the deadline.
//! - A call offer: the issuer says whether it redeems by
//!   [`CALL_NOTICE_BEFORE`] working days before the offer date; the
//!   holder has nothing to submit.
//! - Rating changes: one notch at a time. An issuer may have had one in
//!   the last [`PAST_DAYS`] days, which ended at today's rating, and may
//!   have one ahead of it, likelier in the direction of its outlook.
//! - Defaults: an issuer rated BB- or lower may miss a payment on a
//!   payment day ahead (a technical default); it pays within
//!   [`GRACE_DAYS`] working days (the default is cured), or does not, and
//!   the issue is in default. Payments after a default are not listed.

use super::rng::{derive, Rng};
use super::universe::{iso, CouponKind, OfferKind, Outlook, Universe, RATINGS};
use tyche_yield::date::parse_iso_date;
use tyche_yield::{derive_bond, Market};

/// Working days in a put offer's window.
pub const PUT_WINDOW_DAYS: i64 = 5;
/// Working days between the window's last day and the offer date.
pub const PUT_WINDOW_ENDS_BEFORE: i64 = 3;
/// Working days before a call offer by which the issuer gives notice.
pub const CALL_NOTICE_BEFORE: i64 = 10;
/// How far back the scenario's past rating changes go, days.
pub const PAST_DAYS: i64 = 180;
/// Working days a missed payment may be made late before it is a default.
pub const GRACE_DAYS: i64 = 10;
/// Ratings from this index down (BB-) may default in the scenario.
pub const DEFAULT_FROM: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    Coupon,
    Amortisation,
    Maturity,
    /// The holder may ask the issuer to buy the bond back at its face
    /// value at the offer.
    PutOffer,
    /// The issuer may redeem the bond at its face value at the offer.
    CallOffer,
    RatingChange,
    /// A payment not made on its day.
    TechnicalDefault,
    /// The missed payment made within the grace period.
    DefaultCured,
    /// The grace period over without the payment.
    Default,
}

impl EventKind {
    pub fn code(self) -> &'static str {
        match self {
            EventKind::Coupon => "coupon",
            EventKind::Amortisation => "amortisation",
            EventKind::Maturity => "maturity",
            EventKind::PutOffer => "put_offer",
            EventKind::CallOffer => "call_offer",
            EventKind::RatingChange => "rating_change",
            EventKind::TechnicalDefault => "technical_default",
            EventKind::DefaultCured => "default_cured",
            EventKind::Default => "default",
        }
    }
}

/// Where an event comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// The issue's terms.
    Terms,
    /// The synthetic universe's scenario.
    Scenario,
}

impl Source {
    pub fn code(self) -> &'static str {
        match self {
            Source::Terms => "terms",
            Source::Scenario => "scenario",
        }
    }
}

/// One event of a holding. Days are offsets from the valuation date.
#[derive(Debug, Clone, PartialEq)]
pub struct HoldingEvent {
    pub kind: EventKind,
    pub source: Source,
    pub day: i64,
    /// `YYYY-MM-DD`.
    pub date: String,
    /// A payment per bond (a coupon, principal, the redemption at an
    /// offer, or a payment missed or made late); 0 for other events.
    pub per_bond: f64,
    /// `per_bond` times the bonds held.
    pub amount: f64,
    /// A floater's or a linker's coupon, at today's index.
    pub projected: bool,
    /// A put offer's window to ask for redemption: its first and last
    /// working day, the last being the deadline.
    pub window: Option<(i64, i64)>,
    /// A call offer: the day by which the issuer gives notice.
    pub notice_day: Option<i64>,
    /// A rating change: the issue's rating before and after, as indices
    /// into [`RATINGS`].
    pub rating: Option<(usize, usize)>,
}

/// Monday is 0: day 0 since 1970-01-01 was a Thursday.
fn weekday(epoch_day: i64) -> i64 {
    (epoch_day + 3).rem_euclid(7)
}

fn is_working(epoch_day: i64) -> bool {
    weekday(epoch_day) < 5
}

/// The working day `n` working days before (`n` < 0) or after a day; a
/// day that is not a working day counts from the working day before it
/// when going back and after it when going forward.
fn working_days_from(epoch_day: i64, n: i64) -> i64 {
    let step = if n < 0 { -1 } else { 1 };
    let mut d = epoch_day;
    while !is_working(d) {
        d += step;
    }
    let mut left = n.abs();
    while left > 0 {
        d += step;
        if is_working(d) {
            left -= 1;
        }
    }
    d
}

/// The scenario of one issuer: its rating changes (day, notches; positive
/// is a downgrade) and the day it may first miss a payment.
struct Scenario {
    changes: Vec<(i64, i64)>,
    miss_from: Option<i64>,
    /// Whether a missed payment is made within the grace period, and how
    /// many working days late.
    cured_after: Option<i64>,
}

fn scenario(seed: u64, issuer: usize, rating: usize, outlook: Outlook) -> Scenario {
    let mut r = Rng::new(derive(seed, &[6, issuer as u64]));
    let mut changes = Vec::new();
    // A past change that ended at today's rating: in the direction the
    // outlook keeps, or either way for a stable one.
    let past = match outlook {
        Outlook::Stable => 0.25,
        _ => 0.6,
    };
    if r.chance(past) {
        let day = -(r.range(7.0, PAST_DAYS as f64) as i64);
        let notches = match outlook {
            Outlook::Negative => 1,
            Outlook::Positive => -1,
            Outlook::Stable => {
                if r.chance(0.5) {
                    1
                } else {
                    -1
                }
            }
        };
        let before = rating as i64 - notches;
        if (0..RATINGS.len() as i64).contains(&before) {
            changes.push((day, notches));
        }
    }
    // One ahead, likelier in the outlook's direction.
    let (ahead, notches) = match outlook {
        Outlook::Negative => (0.5, 1),
        Outlook::Positive => (0.4, -1),
        Outlook::Stable => (0.06, if r.chance(0.5) { 1 } else { -1 }),
    };
    if r.chance(ahead) {
        let day = r.range(30.0, 540.0) as i64;
        let after = rating as i64 + notches;
        if (0..RATINGS.len() as i64).contains(&after) {
            changes.push((day, notches));
        }
    }
    let mut miss_from = None;
    let mut cured_after = None;
    if rating >= DEFAULT_FROM {
        let p = if outlook == Outlook::Negative {
            0.6
        } else {
            0.3
        };
        if r.chance(p) {
            miss_from = Some(r.range(30.0, 720.0) as i64);
            if r.chance(0.4) {
                cured_after = Some(1 + r.below(GRACE_DAYS as usize) as i64);
            }
        }
    }
    Scenario {
        changes,
        miss_from,
        cured_after,
    }
}

/// The events of a holding of `bonds` bonds of issue `index`, from
/// [`PAST_DAYS`] days back to the last payment, by day; on the same day
/// in the order coupon, amortisation, maturity, offers, then the
/// scenario's. `None` for an index past the end.
pub fn holding_events(u: &Universe, index: usize, bonds: f64) -> Option<Vec<HoldingEvent>> {
    let issue = u.issues.get(index)?;
    let today = parse_iso_date(&u.inputs.valuation_date)?;
    let market = Market {
        valuation_date: u.inputs.valuation_date.clone(),
        key_rate_pct: u.inputs.key_rate_pct,
    };
    let d = derive_bond(&issue.engine, &market).ok()?;
    let projected = issue.kind != CouponKind::Fixed;
    let ev = |kind, source, day: i64, per_bond: f64| HoldingEvent {
        kind,
        source,
        day,
        date: iso(today + day),
        per_bond,
        amount: per_bond * bonds,
        projected: false,
        window: None,
        notice_day: None,
        rating: None,
    };
    let mut out = Vec::new();

    // The scenario first, so the payments can stop at a default.
    let issuer = &u.issuers[issue.issuer];
    let s = if issue.issuer == 0 {
        Scenario {
            changes: Vec::new(),
            miss_from: None,
            cured_after: None,
        }
    } else {
        scenario(u.seed, issue.issuer, issuer.rating, issuer.outlook)
    };
    let last = d.flows.days.last().copied().unwrap_or(0.0) as i64;
    // The payment day the issuer misses: the first on or after the
    // scenario's day.
    let missed = s
        .miss_from
        .and_then(|from| d.flows.days.iter().map(|&x| x as i64).find(|&x| x >= from));
    let mut stop = i64::MAX;
    if let Some(day) = missed {
        let i = d.flows.days.iter().position(|&x| x as i64 == day)?;
        let due = d.flows.coupons[i] + d.flows.principals[i];
        out.push(ev(EventKind::TechnicalDefault, Source::Scenario, day, due));
        let epoch = today + day;
        match s.cured_after {
            Some(late) => {
                let paid = working_days_from(epoch, late) - today;
                out.push(ev(EventKind::DefaultCured, Source::Scenario, paid, due));
            }
            None => {
                let defaulted = working_days_from(epoch, GRACE_DAYS) - today;
                out.push(ev(EventKind::Default, Source::Scenario, defaulted, 0.0));
                stop = day;
            }
        }
    }

    for (i, &x) in d.flows.days.iter().enumerate() {
        let day = x as i64;
        if day > stop || Some(day) == missed {
            continue;
        }
        let coupon = d.flows.coupons[i];
        let principal = d.flows.principals[i];
        if coupon > 0.0 {
            let mut e = ev(EventKind::Coupon, Source::Terms, day, coupon);
            e.projected = projected;
            out.push(e);
        }
        if principal > 0.0 {
            let kind = if day == last {
                EventKind::Maturity
            } else {
                EventKind::Amortisation
            };
            out.push(ev(kind, Source::Terms, day, principal));
        }
    }

    if let (Some(offer), Some(offer_day)) = (&issue.offer, d.offer_day) {
        let day = offer_day as i64;
        if day <= stop {
            // Redeemed at the face value still outstanding then.
            let repaid: f64 = d
                .flows
                .days
                .iter()
                .zip(&d.flows.principals)
                .filter(|(&x, _)| (x as i64) < day)
                .map(|(_, p)| p)
                .sum();
            let face = issue.engine.nominal - repaid;
            let epoch = today + day;
            match offer.kind {
                OfferKind::Put => {
                    let last_day = working_days_from(epoch, -PUT_WINDOW_ENDS_BEFORE);
                    let first_day = working_days_from(last_day, -(PUT_WINDOW_DAYS - 1));
                    let mut e = ev(EventKind::PutOffer, Source::Terms, day, face);
                    e.window = Some((first_day - today, last_day - today));
                    out.push(e);
                }
                OfferKind::Call => {
                    let mut e = ev(EventKind::CallOffer, Source::Terms, day, face);
                    e.notice_day = Some(working_days_from(epoch, -CALL_NOTICE_BEFORE) - today);
                    out.push(e);
                }
            }
        }
    }

    // Rating changes, on the issue's own scale (a subordinated issue sits
    // two notches under its issuer).
    let offset = issue.rating as i64 - issuer.rating as i64;
    for &(day, notches) in &s.changes {
        if day > stop {
            continue;
        }
        let clamp = |x: i64| x.clamp(0, RATINGS.len() as i64 - 1) as usize;
        let (from, to) = if day < 0 {
            (clamp(issuer.rating as i64 - notches + offset), issue.rating)
        } else {
            (issue.rating, clamp(issuer.rating as i64 + notches + offset))
        };
        if from == to || day > last {
            continue;
        }
        let mut e = ev(EventKind::RatingChange, Source::Scenario, day, 0.0);
        e.rating = Some((from, to));
        out.push(e);
    }

    let rank = |k: EventKind| match k {
        EventKind::Coupon => 0,
        EventKind::Amortisation => 1,
        EventKind::Maturity => 2,
        EventKind::PutOffer | EventKind::CallOffer => 3,
        EventKind::RatingChange => 4,
        EventKind::TechnicalDefault => 5,
        EventKind::DefaultCured => 6,
        EventKind::Default => 7,
    };
    out.sort_by(|a, b| a.day.cmp(&b.day).then(rank(a.kind).cmp(&rank(b.kind))));
    Some(out)
}
