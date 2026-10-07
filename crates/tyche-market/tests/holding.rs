//! The order ticket's market side and a holding's events: the depth check
//! on generated books, who may buy each issue, and the events of a
//! holding of every issue of the default universe.

use std::collections::BTreeMap;
use std::sync::OnceLock;
use tyche_market::synth::{
    self, events, gate, inputs, json, Access, EventKind, Reason, Segment, Source, Universe, RATINGS,
};
use tyche_market::{depth_check, Levels, Side};
use tyche_yield::{derive_bond, Market};

fn universe() -> &'static Universe {
    static U: OnceLock<Universe> = OnceLock::new();
    U.get_or_init(|| synth::generate(synth::DEFAULT_SEED, &inputs::fallback()).unwrap())
}

const MIDDAY_MS: u32 = 13 * 3_600_000;

/// A small seeded generator for the orders, apart from the market's.
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// The same check written plainly: walk the opposite side best first.
fn naive(levels: &Levels, side: Side, quantity: u64, limit: i64) -> (u64, f64, usize) {
    let side_levels: Vec<(i64, u64)> = match side {
        Side::Buy => levels.asks.iter().map(|(p, s)| (*p, *s)).collect(),
        Side::Sell => levels.bids.iter().rev().map(|(p, s)| (*p, *s)).collect(),
    };
    let (mut left, mut value, mut used) = (quantity, 0.0, 0);
    for (p, s) in side_levels {
        let ok = if side == Side::Buy {
            p <= limit
        } else {
            p >= limit
        };
        if left == 0 || !ok {
            break;
        }
        let take = left.min(s);
        value += p as f64 * take as f64;
        left -= take;
        used += 1;
    }
    (quantity - left, value, used)
}

#[test]
fn the_depth_check_on_generated_books_fills_what_the_book_shows_at_or_better_than_the_limit() {
    let u = universe();
    let mut g = Lcg(20_261_007);
    let mut checked = 0;
    let mut partial = 0;
    for (index, issue) in u.issues.iter().enumerate() {
        let day = synth::simulate(u.seed, index, issue, 0, Some(MIDDAY_MS));
        let levels = day.book.levels();
        let (Some((bid, _)), Some((ask, _))) = levels.best() else {
            continue;
        };
        let visible_ask: u64 = levels.asks.values().sum();
        for _ in 0..8 {
            let side = if g.next() < 0.5 {
                Side::Buy
            } else {
                Side::Sell
            };
            let quantity = 1 + (g.next() * 1.5 * visible_ask as f64) as u64;
            // A limit from a little worse than the best to well through
            // the book.
            let reach = ((g.next() - 0.1) * 0.02 * ask as f64) as i64;
            let limit = match side {
                Side::Buy => ask + reach,
                Side::Sell => bid - reach,
            };
            let c = depth_check(levels, side, quantity, limit);
            let (filled, value, used) = naive(levels, side, quantity, limit);
            assert_eq!(
                (c.filled, c.levels_used),
                (filled, used),
                "{}",
                issue.ticker
            );
            assert_eq!(c.filled + c.left, quantity);
            assert_eq!(c.fills.iter().map(|f| f.1).sum::<u64>(), c.filled);
            match c.average {
                None => assert_eq!(c.filled, 0),
                Some(a) => {
                    assert!((a - value / filled as f64).abs() < 1e-6);
                    let best = c.best.unwrap() as f64;
                    let worst = c.worst.unwrap() as f64;
                    // Between the best price and the last level reached,
                    // never past the limit; slippage is never negative.
                    assert!(a >= best.min(worst) - 1e-9 && a <= best.max(worst) + 1e-9);
                    match side {
                        Side::Buy => assert!(worst <= limit as f64),
                        Side::Sell => assert!(worst >= limit as f64),
                    }
                    assert!(c.slippage_bp.unwrap() >= 0.0);
                    if c.levels_used == 1 {
                        assert_eq!(c.slippage_bp, Some(0.0));
                    }
                }
            }
            if c.filled > 0 && c.left > 0 {
                partial += 1;
            }
            checked += 1;
        }
        // A buy limited under the best ask fills nothing; one far through
        // the book fills what the side shows, up to its ten levels.
        assert_eq!(depth_check(levels, Side::Buy, 10, ask - 1).filled, 0);
        let all = depth_check(levels, Side::Buy, visible_ask + 1, i64::MAX);
        assert_eq!((all.filled, all.left), (visible_ask, 1));
        assert_eq!(all.levels_used, levels.asks.len());
        assert!(all.levels_used <= synth::day::LEVELS);
    }
    assert!(checked > 1_000, "{checked}");
    assert!(partial > 50, "{partial}");
}

#[test]
fn the_gate_follows_the_synthetic_rule_for_every_issue() {
    let u = universe();
    let mut seen: BTreeMap<&str, usize> = BTreeMap::new();
    for s in &u.issues {
        let g = gate(s);
        *seen.entry(g.access.code()).or_default() += 1;
        if s.qualified_only {
            assert_eq!(g.access, Access::Qualified, "{}", s.ticker);
            assert_eq!(g.reasons.contains(&Reason::Subordinated), s.subordinated);
        } else if s.segment == Segment::Government {
            assert_eq!(g.access, Access::Open);
        } else if s.rating > synth::access::TEST_BELOW {
            assert_eq!(g.access, Access::Test, "{} {}", s.ticker, RATINGS[s.rating]);
        } else {
            assert_eq!(g.access, Access::Open);
        }
        // Every subordinated issue is for qualified investors only.
        if s.subordinated {
            assert_eq!(g.access, Access::Qualified);
        }
    }
    assert!(seen.len() == 3 && seen.values().all(|&n| n > 5), "{seen:?}");
    let text = json::access_json(u);
    assert!(text.starts_with("{\"testBelow\":\"BBB-\""));
    assert_eq!(text.matches("\"ticker\"").count(), u.issues.len());
}

fn market(u: &Universe) -> Market {
    Market {
        valuation_date: u.inputs.valuation_date.clone(),
        key_rate_pct: u.inputs.key_rate_pct,
    }
}

/// Day offset to the epoch day of the valuation date, for weekdays.
fn weekday(u: &Universe, day: i64) -> i64 {
    let today = tyche_yield::date::parse_iso_date(&u.inputs.valuation_date).unwrap();
    (today + day + 3).rem_euclid(7)
}

#[test]
fn a_holding_lists_its_payments_from_the_terms_and_its_offer_window() {
    let u = universe();
    let mut puts = 0;
    let mut calls = 0;
    for (index, s) in u.issues.iter().enumerate() {
        let list = synth::holding_events(u, index, 10.0).unwrap();
        assert!(
            list.windows(2).all(|w| w[0].day <= w[1].day),
            "{}",
            s.ticker
        );
        let d = derive_bond(&s.engine, &market(u)).unwrap();
        let defaulted = list.iter().any(|e| e.kind == EventKind::Default);
        let missed: Vec<i64> = list
            .iter()
            .filter(|e| e.kind == EventKind::TechnicalDefault)
            .map(|e| e.day)
            .collect();
        // Every coupon is the engine's, for ten bonds; projected unless
        // the coupon is fixed.
        for e in list.iter().filter(|e| e.kind == EventKind::Coupon) {
            let i = d
                .flows
                .days
                .iter()
                .position(|&x| x as i64 == e.day)
                .unwrap();
            assert_eq!(e.per_bond, d.flows.coupons[i]);
            assert!((e.amount - 10.0 * e.per_bond).abs() < 1e-9);
            assert_eq!(e.projected, s.kind != synth::CouponKind::Fixed);
            assert_eq!(e.source, Source::Terms);
        }
        // Without a missed payment, the principal adds up to the nominal.
        if missed.is_empty() {
            let principal: f64 = list
                .iter()
                .filter(|e| matches!(e.kind, EventKind::Amortisation | EventKind::Maturity))
                .map(|e| e.per_bond)
                .sum();
            assert!((principal - s.engine.nominal).abs() < 1e-6, "{}", s.ticker);
            assert_eq!(
                list.iter()
                    .filter(|e| e.kind == EventKind::Maturity)
                    .count(),
                1
            );
        }
        for e in &list {
            match e.kind {
                EventKind::PutOffer => {
                    puts += 1;
                    let (from, to) = e.window.unwrap();
                    assert!(from < to && to < e.day);
                    // Five working days, the last three working days before
                    // the offer; every one a weekday.
                    let working: Vec<i64> = (from..=to).filter(|&x| weekday(u, x) < 5).collect();
                    assert_eq!(working.len() as i64, events::PUT_WINDOW_DAYS);
                    assert!(weekday(u, from) < 5 && weekday(u, to) < 5);
                    // Counted back from the offer day, or from the working
                    // day before it when it falls on a weekend.
                    let between = (to + 1..e.day).filter(|&x| weekday(u, x) < 5).count() as i64;
                    let offer_working = i64::from(weekday(u, e.day) < 5);
                    assert_eq!(between + offer_working, events::PUT_WINDOW_ENDS_BEFORE);
                    assert!(e.per_bond > 0.0 && e.per_bond <= s.engine.nominal + 1e-9);
                }
                EventKind::CallOffer => {
                    calls += 1;
                    assert!(e.notice_day.unwrap() < e.day);
                }
                _ => {}
            }
        }
        // After a default nothing more is paid.
        if defaulted {
            let at = missed[0];
            assert!(list.iter().filter(|e| e.day > at).all(|e| !matches!(
                e.kind,
                EventKind::Coupon | EventKind::Amortisation | EventKind::Maturity
            )));
        }
    }
    assert!(puts > 5 && calls > 2, "{puts} {calls}");
}

#[test]
fn the_scenario_changes_ratings_a_notch_and_defaults_only_low_rated_issuers() {
    let u = universe();
    let mut kinds: BTreeMap<&str, usize> = BTreeMap::new();
    for (index, s) in u.issues.iter().enumerate() {
        let list = synth::holding_events(u, index, 1.0).unwrap();
        let issuer = &u.issuers[s.issuer];
        for e in &list {
            *kinds.entry(e.kind.code()).or_default() += 1;
            match e.kind {
                EventKind::RatingChange => {
                    assert_eq!(e.source, Source::Scenario);
                    let (from, to) = e.rating.unwrap();
                    assert_eq!(from.abs_diff(to), 1, "{}", s.ticker);
                    // A past change ends at today's rating, one ahead starts there.
                    if e.day < 0 {
                        assert!(e.day >= -events::PAST_DAYS);
                        assert_eq!(to, s.rating);
                    } else {
                        assert_eq!(from, s.rating);
                    }
                    assert_ne!(s.segment, Segment::Government);
                }
                EventKind::TechnicalDefault | EventKind::DefaultCured | EventKind::Default => {
                    assert!(issuer.rating >= events::DEFAULT_FROM, "{}", s.ticker);
                    assert!(e.day > 0);
                }
                _ => assert!(e.day > 0, "{} {:?}", s.ticker, e.kind),
            }
        }
        // A missed payment is either made within the grace period or is a
        // default, never both.
        let cured = list
            .iter()
            .filter(|e| e.kind == EventKind::DefaultCured)
            .count();
        let def = list.iter().filter(|e| e.kind == EventKind::Default).count();
        let tech = list
            .iter()
            .filter(|e| e.kind == EventKind::TechnicalDefault)
            .count();
        assert_eq!(tech, cured + def);
        assert!(tech <= 1);
    }
    // The scenario holds every kind of event.
    for k in [
        "coupon",
        "amortisation",
        "maturity",
        "put_offer",
        "call_offer",
        "rating_change",
        "technical_default",
        "default_cured",
        "default",
    ] {
        assert!(kinds.get(k).copied().unwrap_or(0) > 0, "{k}: {kinds:?}");
    }
}

#[test]
fn the_events_are_the_same_on_every_run_and_pinned() {
    let u = universe();
    let all = |u: &Universe| {
        (0..u.issues.len())
            .map(|i| json::events_json(&synth::holding_events(u, i, 7.0).unwrap()))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let a = all(u);
    assert_eq!(
        a,
        all(&synth::generate(synth::DEFAULT_SEED, &inputs::fallback()).unwrap())
    );
    assert!(synth::holding_events(u, u.issues.len(), 1.0).is_none());
    // Pinned, so a change to the scenario is seen and explained.
    assert_eq!(
        format!("{:016x}", json::fnv1a(a.as_bytes())),
        "be90933fcacc3bf3"
    );
}
