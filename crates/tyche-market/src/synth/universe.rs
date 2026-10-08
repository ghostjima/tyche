//! The synthetic universe: fictional issuers and their issues, each
//! priced by tyche-yield from a yield that is the zero-coupon curve at the
//! issue's duration plus a spread for its rating and sector.
//!
//! Every name, code and rating here is invented. Government-like issues
//! form the group "synthetic government bonds", issued by a fictional
//! treasury; their codes (`SG-104`) have nothing in common with real
//! federal loan bond numbers. Ratings are on a AAA to B scale of their
//! own, with no agency and no agency suffix.

use super::calibration as cal;
use super::det;
use super::inputs::Inputs;
use super::rng::{derive, Rng};
use tyche_yield::date::{civil_from_days, parse_iso_date};
use tyche_yield::{
    derive_bond, macaulay_duration, modified_duration, price_from_yield, Amortization, CouponType,
    Issue, Market,
};

/// The synthetic rating scale, best first.
pub const RATINGS: [&str; 15] = [
    "AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+",
    "B",
];

/// Places fictional companies are named after: rivers, lakes and
/// regions, by code. The app has a name for each in every language.
pub const PLACES: [(&str, &str); 32] = [
    ("volga", "VLG"),
    ("kama", "KAM"),
    ("oka", "OKA"),
    ("neva", "NEV"),
    ("ob", "OBR"),
    ("amur", "AMR"),
    ("baikal", "BKL"),
    ("ural", "URL"),
    ("don", "DON"),
    ("angara", "ANG"),
    ("irtysh", "IRT"),
    ("lena", "LEN"),
    ("pechora", "PCH"),
    ("onega", "ONG"),
    ("kuban", "KUB"),
    ("yenisei", "ENS"),
    ("vyatka", "VTK"),
    ("sura", "SUR"),
    ("kolyma", "KOL"),
    ("selenga", "SEL"),
    ("tobol", "TOB"),
    ("vetluga", "VET"),
    ("mezen", "MEZ"),
    ("khoper", "KHP"),
    ("sviyaga", "SVG"),
    ("ilmen", "ILM"),
    ("ladoga", "LAD"),
    ("seliger", "SLG"),
    ("tavda", "TAV"),
    ("chusovaya", "CHS"),
    ("belaya", "BEL"),
    ("shilka", "SHL"),
];

/// Lines of business. The app names a company as its place and a phrase
/// for the sector.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sector {
    Government,
    Energy,
    Metals,
    Logistics,
    Retail,
    Telecom,
    Development,
    Agro,
    Leasing,
    Banking,
    Chemicals,
}

pub const CORPORATE_SECTORS: [Sector; 10] = [
    Sector::Energy,
    Sector::Metals,
    Sector::Logistics,
    Sector::Retail,
    Sector::Telecom,
    Sector::Development,
    Sector::Agro,
    Sector::Leasing,
    Sector::Banking,
    Sector::Chemicals,
];

impl Sector {
    pub fn code(self) -> &'static str {
        match self {
            Sector::Government => "government",
            Sector::Energy => "energy",
            Sector::Metals => "metals",
            Sector::Logistics => "logistics",
            Sector::Retail => "retail",
            Sector::Telecom => "telecom",
            Sector::Development => "development",
            Sector::Agro => "agro",
            Sector::Leasing => "leasing",
            Sector::Banking => "banking",
            Sector::Chemicals => "chemicals",
        }
    }

    fn letter(self) -> char {
        match self {
            Sector::Government => 'G',
            Sector::Energy => 'E',
            Sector::Metals => 'M',
            Sector::Logistics => 'L',
            Sector::Retail => 'R',
            Sector::Telecom => 'T',
            Sector::Development => 'D',
            Sector::Agro => 'A',
            Sector::Leasing => 'F',
            Sector::Banking => 'B',
            Sector::Chemicals => 'C',
        }
    }

    /// Added to the rating's credit spread, percent (assumptions).
    pub(crate) fn spread_pct(self) -> f64 {
        match self {
            Sector::Government => 0.0,
            Sector::Energy => -0.2,
            Sector::Metals => -0.1,
            Sector::Logistics => 0.1,
            Sector::Retail => 0.2,
            Sector::Telecom => 0.0,
            Sector::Development => 0.6,
            Sector::Agro => 0.3,
            Sector::Leasing => 0.4,
            Sector::Banking => 0.0,
            Sector::Chemicals => 0.1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Segment {
    /// Synthetic government bonds.
    Government,
    Corporate,
}

impl Segment {
    pub fn code(self) -> &'static str {
        match self {
            Segment::Government => "government",
            Segment::Corporate => "corporate",
        }
    }
}

/// How the coupon is set.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CouponKind {
    Fixed,
    /// The key rate plus a spread.
    KeyRate,
    /// RUONIA plus a spread.
    Ruonia,
    /// A fixed real coupon on a nominal indexed to inflation.
    Linker,
}

impl CouponKind {
    pub fn code(self) -> &'static str {
        match self {
            CouponKind::Fixed => "fixed",
            CouponKind::KeyRate => "key_rate",
            CouponKind::Ruonia => "ruonia",
            CouponKind::Linker => "linker",
        }
    }
}

/// Where the fictional agency expects an issuer's synthetic rating to go.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outlook {
    Stable,
    Positive,
    Negative,
}

impl Outlook {
    pub fn code(self) -> &'static str {
        match self {
            Outlook::Stable => "stable",
            Outlook::Positive => "positive",
            Outlook::Negative => "negative",
        }
    }
}

/// The shares of stable, positive and negative outlooks among corporate
/// issuers rated BBB- and above, and below it (assumptions: most outlooks
/// are stable, and a negative one is likelier lower on the scale).
const OUTLOOK_WEIGHTS: [f64; 3] = [0.78, 0.12, 0.10];
const OUTLOOK_WEIGHTS_LOW: [f64; 3] = [0.70, 0.08, 0.22];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OfferKind {
    /// The holder may sell the bond back to the issuer at face value.
    Put,
    /// The issuer may redeem the bond early at face value.
    Call,
}

impl OfferKind {
    pub fn code(self) -> &'static str {
        match self {
            OfferKind::Put => "put",
            OfferKind::Call => "call",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Offer {
    pub date: String,
    pub kind: OfferKind,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Issuer {
    /// Four letters: the place's code and the sector's letter (`VLGE`);
    /// `SGT` for the synthetic treasury.
    pub code: String,
    /// A code from [`PLACES`]; empty for the treasury.
    pub place: &'static str,
    pub sector: Sector,
    /// Index into [`RATINGS`].
    pub rating: usize,
    /// The synthetic rating's outlook; stable for the treasury.
    pub outlook: Outlook,
}

/// How an issue trades: the base of the day's simulation and the
/// snapshot's figures.
#[derive(Debug, Clone, PartialEq)]
pub struct Liquidity {
    /// 0 for the most liquid issue of its segment, 1 for the least.
    pub rank: f64,
    /// Quoted spread at mid-session, basis points of the mid price.
    pub spread_bp: f64,
    /// Visible size per side, bonds.
    pub depth: f64,
    /// Expected trades a day.
    pub trades_per_day: f64,
    /// Trades in the morning session.
    pub morning: bool,
    /// Trades in the evening session.
    pub evening: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SynthIssue {
    /// Latin letters, digits and a hyphen, at most eight characters.
    pub ticker: String,
    pub segment: Segment,
    /// Index into [`Universe::issuers`].
    pub issuer: usize,
    /// Index into [`RATINGS`]: the issuer's, two notches lower for a
    /// subordinated issue.
    pub rating: usize,
    pub kind: CouponKind,
    /// Over the key rate or RUONIA, percent; 0 for other kinds.
    pub index_spread_pct: f64,
    /// A linker's nominal over its original nominal; 1 for other kinds.
    pub index_ratio: f64,
    pub offer: Option<Offer>,
    pub subordinated: bool,
    pub qualified_only: bool,
    /// Bonds per lot.
    pub lot: u32,
    /// Price step, units of 0.0001 percent of face.
    pub tick: i64,
    /// The yield the price was set from: to the offer when there is one,
    /// to maturity otherwise. For a linker it is the real yield.
    pub target_yield: f64,
    /// What tyche-yield takes; its price is the clean price on the tick.
    pub engine: Issue,
    /// Modified duration to the nearest exit at the engine's yield, years.
    pub duration: f64,
    pub liquidity: Liquidity,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Universe {
    pub seed: u64,
    pub inputs: Inputs,
    pub issuers: Vec<Issuer>,
    pub issues: Vec<SynthIssue>,
}

/// Why a universe cannot be generated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputError {
    InvalidDate,
    InvalidCurve,
    InvalidRate,
}

impl InputError {
    pub fn code(self) -> &'static str {
        match self {
            InputError::InvalidDate => "invalid_date",
            InputError::InvalidCurve => "invalid_curve",
            InputError::InvalidRate => "invalid_rate",
        }
    }
}

pub(crate) fn iso(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// The credit spread over the curve for a rating, percent (an
/// assumption, convex in the notch: 0.6 at AAA, about 3.8 at BBB, about
/// 9.2 at B).
pub(crate) fn rating_spread_pct(rating: usize) -> f64 {
    let g = rating as f64;
    0.6 + 0.12 * g + 0.035 * g * g
}

/// A value from a distribution given by (share, value) knots, log-linear
/// between knots.
pub(crate) fn from_knots(knots: &[(f64, f64)], q: f64) -> f64 {
    let q = q.clamp(0.0, 1.0);
    for w in knots.windows(2) {
        let ((q0, v0), (q1, v1)) = (w[0], w[1]);
        if q <= q1 {
            let t = if q1 > q0 { (q - q0) / (q1 - q0) } else { 0.0 };
            return det::exp(det::ln(v0) + t * (det::ln(v1) - det::ln(v0)));
        }
    }
    knots[knots.len() - 1].1
}

/// Ranks of noisy scores, as quantiles (i + 0.5) / n: an issue's place in
/// the cross-section of a figure, so the cross-section follows the
/// distribution closely while each issue's figures still vary.
fn quantiles_of(scores: &[f64]) -> Vec<f64> {
    let n = scores.len();
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| scores[a].total_cmp(&scores[b]).then(a.cmp(&b)));
    let mut q = vec![0.0; n];
    for (rank, &i) in order.iter().enumerate() {
        q[i] = (rank as f64 + 0.5) / n as f64;
    }
    q
}

struct Shape {
    segment: Segment,
    issuer: usize,
    ticker: String,
    kind: CouponKind,
    term_days: i64,
    period_days: f64,
    amortising: bool,
    offer: Option<OfferKind>,
    subordinated: bool,
}

/// Generates the universe for a seed and a market. Pure: the same seed
/// and inputs give the same universe on every platform.
pub fn generate(seed: u64, inputs: &Inputs) -> Result<Universe, InputError> {
    let today = parse_iso_date(&inputs.valuation_date).ok_or(InputError::InvalidDate)?;
    if !inputs.curve.is_valid() {
        return Err(InputError::InvalidCurve);
    }
    for r in [inputs.key_rate_pct, inputs.ruonia_pct, inputs.inflation_pct] {
        if !(r.is_finite() && r > -50.0 && r < 200.0) {
            return Err(InputError::InvalidRate);
        }
    }
    let mut rng = Rng::new(derive(seed, &[1]));
    let mut issuers = vec![Issuer {
        code: "SGT".into(),
        place: "",
        sector: Sector::Government,
        rating: 0,
        outlook: Outlook::Stable,
    }];
    let mut shapes = Vec::new();

    // Synthetic government bonds: series by kind, terms spread from a few
    // months to twenty years.
    struct Series {
        kind: CouponKind,
        amortising: bool,
        count: usize,
        base: u32,
        years: (f64, f64),
        period: f64,
    }
    let series = |kind, amortising, count, base, years, period| Series {
        kind,
        amortising,
        count,
        base,
        years,
        period,
    };
    let gov = [
        series(CouponKind::Fixed, false, 20, 100, (0.4, 20.0), 182.0),
        series(CouponKind::KeyRate, false, 4, 200, (1.0, 7.0), 91.0),
        series(CouponKind::Ruonia, false, 4, 300, (1.0, 8.0), 91.0),
        series(CouponKind::Linker, false, 3, 400, (3.0, 12.0), 182.0),
        series(CouponKind::Fixed, true, 3, 500, (5.0, 15.0), 182.0),
    ];
    for Series {
        kind,
        amortising,
        count,
        base,
        years: (lo, hi),
        period,
    } in gov
    {
        for i in 0..count {
            // Terms stratified over the range, so the curve is covered.
            let u = (i as f64 + rng.range(0.15, 0.85)) / count as f64;
            let years = det::exp(det::ln(lo) + u * (det::ln(hi) - det::ln(lo)));
            shapes.push(Shape {
                segment: Segment::Government,
                issuer: 0,
                ticker: format!("SG-{}", base + 1 + 3 * i as u32 + rng.below(3) as u32),
                kind,
                term_days: (years * 365.0) as i64 + 1,
                period_days: period,
                amortising,
                offer: None,
                subordinated: false,
            });
        }
    }

    // Corporate issuers: a place and a sector each, no pair twice.
    let weights = [
        1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 6.0, 6.0, 6.0, 5.0, 4.0, 4.0, 3.0, 2.0, 1.0,
    ];
    let mut pairs: Vec<(usize, usize)> = Vec::new();
    while pairs.len() < 72 {
        let pair = (rng.below(PLACES.len()), rng.below(CORPORATE_SECTORS.len()));
        if !pairs.contains(&pair) {
            pairs.push(pair);
        }
    }
    for (p, s) in pairs {
        let sector = CORPORATE_SECTORS[s];
        let (place, code) = PLACES[p];
        let issuer = issuers.len();
        issuers.push(Issuer {
            code: format!("{code}{}", sector.letter()),
            place,
            sector,
            rating: rng.weighted(&weights),
            outlook: Outlook::Stable,
        });
        let count = 1 + rng.weighted(&[0.35, 0.35, 0.2, 0.1]);
        for n in 0..count {
            let subordinated =
                matches!(sector, Sector::Banking | Sector::Leasing) && rng.chance(0.35);
            let kind = match rng.weighted(&[0.62, 0.2, 0.13, 0.05]) {
                0 => CouponKind::Fixed,
                1 => CouponKind::KeyRate,
                2 => CouponKind::Ruonia,
                _ => CouponKind::Linker,
            };
            let years = if subordinated {
                rng.range(5.0, 10.0)
            } else {
                rng.log_range(0.3, 8.0)
            };
            let offer = if rng.chance(0.25) {
                Some(if rng.chance(0.7) {
                    OfferKind::Put
                } else {
                    OfferKind::Call
                })
            } else {
                None
            };
            shapes.push(Shape {
                segment: Segment::Corporate,
                issuer,
                ticker: format!("{code}{}-{:02}", sector.letter(), n + 1),
                kind,
                term_days: (years * 365.0) as i64 + 1,
                period_days: *rng.pick(&[30.0, 91.0, 91.0, 182.0, 182.0]),
                amortising: rng.chance(0.25),
                offer,
                subordinated,
            });
        }
    }

    // Outlooks from a stream of their own per issuer, so the rest of the
    // universe is what it was before issuers had one.
    for (index, issuer) in issuers.iter_mut().enumerate().skip(1) {
        let mut r = Rng::new(derive(seed, &[5, index as u64]));
        let weights = if issuer.rating <= 9 {
            &OUTLOOK_WEIGHTS
        } else {
            &OUTLOOK_WEIGHTS_LOW
        };
        issuer.outlook =
            [Outlook::Stable, Outlook::Positive, Outlook::Negative][r.weighted(weights)];
    }

    let market = Market {
        valuation_date: inputs.valuation_date.clone(),
        key_rate_pct: inputs.key_rate_pct,
    };
    let mut issues = Vec::with_capacity(shapes.len());
    for (index, shape) in shapes.into_iter().enumerate() {
        let mut r = Rng::new(derive(seed, &[2, index as u64]));
        issues.push(price_issue(&mut r, shape, &issuers, inputs, &market, today));
    }
    assign_liquidity(seed, &mut issues);
    Ok(Universe {
        seed,
        inputs: inputs.clone(),
        issuers,
        issues,
    })
}

/// The coupon days of a term, counted back from maturity, as the engine
/// counts them.
fn coupon_days(term: i64, period: f64) -> Vec<f64> {
    tyche_yield::coupon_schedule(term as f64, period)
}

fn price_issue(
    r: &mut Rng,
    s: Shape,
    issuers: &[Issuer],
    inputs: &Inputs,
    market: &Market,
    today: i64,
) -> SynthIssue {
    let issuer = &issuers[s.issuer];
    let government = s.segment == Segment::Government;
    let rating = if s.subordinated {
        (issuer.rating + 2).min(RATINGS.len() - 1)
    } else {
        issuer.rating
    };
    let spread = if government {
        r.range(-0.10, 0.20)
    } else {
        rating_spread_pct(rating)
            + issuer.sector.spread_pct()
            + if s.subordinated { 1.5 } else { 0.0 }
            + r.range(-0.3, 0.3)
    };
    let days = coupon_days(s.term_days, s.period_days);

    let mut amortization = Vec::new();
    if s.amortising && days.len() >= 3 {
        let tranches = days.len().min(2 + r.below(4));
        let share = 100.0 / tranches as f64;
        for &d in &days[days.len() - tranches..] {
            amortization.push(Amortization {
                date: iso(today + d as i64),
                fraction_pct: share,
            });
        }
    }
    let offer = match s.offer {
        Some(kind) if days.len() >= 3 => {
            let at = ((days.len() as f64 * r.range(0.3, 0.7)) as usize).min(days.len() - 2);
            Some(Offer {
                date: iso(today + days[at] as i64),
                kind,
            })
        }
        _ => None,
    };

    // A linker's real yield is the nominal one less inflation: the engine
    // prices its indexed nominal with no forecast of the indexation.
    let real = if s.kind == CouponKind::Linker {
        inputs.inflation_pct
    } else {
        0.0
    };
    let index_ratio = if s.kind == CouponKind::Linker {
        let years_out = r.range(0.5, 6.0);
        (det::exp(years_out * det::ln(1.0 + inputs.inflation_pct / 100.0)) * 10_000.0).round()
            / 10_000.0
    } else {
        1.0
    };
    let nominal = (1000.0 * index_ratio * 100.0).round() / 100.0;
    let tick = if government {
        cal::GOV_TICK
    } else if r.chance(cal::CORP_FINE_TICK_SHARE) {
        cal::CORP_FINE_TICK
    } else {
        cal::CORP_TICK
    };
    let lot = if government {
        1
    } else {
        match r.weighted(&[
            1.0 - cal::LOT_100_SHARE - cal::LOT_1000_SHARE,
            cal::LOT_100_SHARE,
            cal::LOT_1000_SHARE,
        ]) {
            0 => 1,
            1 => 100,
            _ => 1000,
        }
    };

    let mut engine = Issue {
        nominal,
        price_pct: 100.0,
        accrued: None,
        coupon_type: CouponType::Fixed,
        coupon_rate_pct: 0.0,
        spread_pct: 0.0,
        period_days: s.period_days,
        maturity: iso(today + s.term_days),
        offers: offer.iter().map(|o| o.date.clone()).collect(),
        amortization,
    };
    let curve = |years: f64| inputs.curve.at(years);
    // First guess of the yield at a two-year duration, then the duration
    // of the issue's own flows: three rounds settle it.
    let mut y_pct = curve(2.0) + spread - real;
    let mut index_spread = 0.0;
    let mut floater_noise = 0.0;
    for round in 0..4 {
        match s.kind {
            CouponKind::Fixed | CouponKind::Linker => {
                if round == 0 {
                    // The coupon near the yield, rounded to a hundredth.
                    let c = if s.kind == CouponKind::Linker {
                        if government {
                            2.5
                        } else {
                            r.range(2.5, 5.0)
                        }
                    } else {
                        (y_pct + r.range(-3.0, 1.5)).clamp(4.0, 24.0)
                    };
                    engine.coupon_rate_pct = (c * 100.0).round() / 100.0;
                }
            }
            CouponKind::KeyRate | CouponKind::Ruonia => {
                if round == 0 {
                    floater_noise = r.range(-0.4, 0.4);
                }
                let index = if s.kind == CouponKind::KeyRate {
                    inputs.key_rate_pct
                } else {
                    inputs.ruonia_pct
                };
                // A floater pays near its yield, so it trades near par.
                index_spread = ((y_pct - index + floater_noise).max(0.05) * 20.0).round() / 20.0;
                engine.coupon_type = CouponType::Floater;
                // The engine's floater pays the key rate plus its spread;
                // RUONIA is the key rate plus today's gap.
                engine.spread_pct = index - inputs.key_rate_pct + index_spread;
            }
        }
        let d = derive_bond(&engine, market).expect("a generated issue derives");
        let flows = d.flows_to_offer.as_ref().unwrap_or(&d.flows);
        let duration = macaulay_duration(&flows.amounts(), &flows.days, y_pct / 100.0);
        y_pct = curve(duration) + spread - real;
    }
    let d = derive_bond(&engine, market).expect("a generated issue derives");
    let flows = d.flows_to_offer.as_ref().unwrap_or(&d.flows);
    let dirty = price_from_yield(&flows.amounts(), &flows.days, y_pct / 100.0);
    let clean_pct = (dirty - d.accrued) / nominal * 100.0;
    let units = (clean_pct * cal::UNITS_PER_PCT / tick as f64).round() as i64 * tick;
    engine.price_pct = units as f64 / cal::UNITS_PER_PCT;
    let d = derive_bond(&engine, market).expect("a generated issue derives");
    let flows = d.flows_to_offer.as_ref().unwrap_or(&d.flows);
    // Rounded, so a last-bit difference in the platform's powf cannot
    // reach the day's random walk.
    let duration =
        (modified_duration(&flows.amounts(), &flows.days, d.yield_event) * 1e6).round() / 1e6;

    let qualified_only =
        s.subordinated || (rating >= 11 && r.chance(0.5)) || (!government && r.chance(0.03));
    SynthIssue {
        ticker: s.ticker,
        segment: s.segment,
        issuer: s.issuer,
        rating,
        kind: s.kind,
        index_spread_pct: index_spread,
        index_ratio,
        offer,
        subordinated: s.subordinated,
        qualified_only,
        lot,
        tick,
        target_yield: y_pct / 100.0,
        engine,
        duration,
        liquidity: Liquidity {
            rank: 0.0,
            spread_bp: 0.0,
            depth: 0.0,
            trades_per_day: 0.0,
            morning: government,
            evening: government,
        },
    }
}

/// Spreads, depth and trades a day from each issue's place in its
/// segment's liquidity order: shorter, larger, better-rated issues are
/// likelier to be liquid, with noise so the order is not fixed by them.
fn assign_liquidity(seed: u64, issues: &mut [SynthIssue]) {
    for segment in [Segment::Government, Segment::Corporate] {
        let idx: Vec<usize> = (0..issues.len())
            .filter(|&i| issues[i].segment == segment)
            .collect();
        let mut r = Rng::new(derive(seed, &[3, segment as u64]));
        let scores: Vec<f64> = idx
            .iter()
            .map(|&i| {
                let is = &issues[i];
                is.rating as f64 * 0.08
                    + if is.qualified_only { 0.3 } else { 0.0 }
                    + r.normal() * 0.35
            })
            .collect();
        let rank = quantiles_of(&scores);
        // The spread's place in its distribution follows the liquidity
        // rank, loosely.
        let spread_q = quantiles_of(
            &rank
                .iter()
                .map(|q| q + r.normal() * 0.15)
                .collect::<Vec<_>>(),
        );
        let n = idx.len();
        for (k, &i) in idx.iter().enumerate() {
            let q = rank[k];
            let order = (q * n as f64 - 0.5).round() as usize;
            let l = &mut issues[i].liquidity;
            l.rank = q;
            let noise = |r: &mut Rng, s: f64| det::exp(r.normal() * s);
            match segment {
                Segment::Government => {
                    l.spread_bp = from_knots(&cal::GOV_SPREAD_BP, spread_q[k]);
                    let (lo, hi) = if q < 0.5 {
                        cal::GOV_LIQUID_DEPTH
                    } else {
                        cal::GOV_ILLIQUID_DEPTH
                    };
                    let w = if q < 0.5 { q / 0.5 } else { (q - 0.5) / 0.5 };
                    let base =
                        det::exp(det::ln(hi * 0.85) + w * (det::ln(lo * 1.2) - det::ln(hi * 0.85)));
                    l.depth = (base * noise(&mut r, 0.05)).clamp(lo, hi);
                    l.trades_per_day = if order < cal::GOV_TOP_ISSUES {
                        let (lo, hi) = cal::GOV_TOP_TRADES;
                        r.range(lo * 1.15, hi * 0.92)
                    } else {
                        let t = (order - cal::GOV_TOP_ISSUES) as f64
                            / (n - cal::GOV_TOP_ISSUES).max(1) as f64;
                        det::exp(det::ln(4_000.0) + t * (det::ln(40.0) - det::ln(4_000.0)))
                            * noise(&mut r, 0.1)
                    };
                }
                Segment::Corporate => {
                    l.spread_bp = from_knots(&cal::CORP_SPREAD_BP, spread_q[k]);
                    let (lo, hi) = cal::CORP_DEPTH;
                    let base =
                        det::exp(det::ln(hi * 0.85) + q * (det::ln(lo * 1.2) - det::ln(hi * 0.85)));
                    l.depth = (base * noise(&mut r, 0.1)).clamp(lo, hi);
                    let t = det::exp(
                        det::ln(cal::CORP_MAX_TRADES * 0.95)
                            + q * (det::ln(2.0) - det::ln(cal::CORP_MAX_TRADES * 0.95)),
                    );
                    l.trades_per_day = (t * noise(&mut r, 0.1)).min(cal::CORP_MAX_TRADES * 0.95);
                    l.morning = q < 0.2;
                    l.evening = q < 0.4;
                }
            }
        }
    }
}

impl SynthIssue {
    /// The calibrated range of visible size per side for this issue's
    /// segment and liquidity, bonds.
    pub fn depth_bounds(&self) -> (f64, f64) {
        match self.segment {
            Segment::Government if self.liquidity.rank < 0.5 => cal::GOV_LIQUID_DEPTH,
            Segment::Government => cal::GOV_ILLIQUID_DEPTH,
            Segment::Corporate => cal::CORP_DEPTH,
        }
    }

    /// The tyche-yield market this issue was priced in.
    pub fn market(inputs: &Inputs) -> Market {
        Market {
            valuation_date: inputs.valuation_date.clone(),
            key_rate_pct: inputs.key_rate_pct,
        }
    }
}
