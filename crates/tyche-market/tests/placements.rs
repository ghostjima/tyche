//! Placements by book-building: the rules of the synthetic universe on
//! the default universe and on others, and the JSON pinned.

use std::collections::BTreeSet;
use tyche_market::synth::placements::{
    allotted, final_coupon, FULL_DEMAND, GUIDANCE_STEP_PCT, PLACEMENTS, SETTLES_AFTER,
};
use tyche_market::synth::{self, inputs, json, placements, BookState, Universe};

fn today(u: &Universe) -> i64 {
    tyche_yield::date::parse_iso_date(&u.inputs.valuation_date).unwrap()
}

/// Monday is 0.
fn weekday(u: &Universe, day: i64) -> i64 {
    (today(u) + day + 3).rem_euclid(7)
}

/// Working days after `from` up to and including `to`.
fn working_days_between(u: &Universe, from: i64, to: i64) -> i64 {
    ((from + 1)..=to).filter(|&d| weekday(u, d) < 5).count() as i64
}

fn on_step(x: f64) -> bool {
    let steps = x / GUIDANCE_STEP_PCT;
    (steps - steps.round()).abs() < 1e-6
}

fn check_rules(u: &Universe) {
    let ps = placements(u);
    assert_eq!(ps.len(), PLACEMENTS, "seed {}", u.seed);
    let states: Vec<BookState> = ps.iter().map(|p| p.state).collect();
    assert_eq!(
        states.iter().filter(|s| **s == BookState::Closed).count(),
        1
    );
    assert_eq!(states.iter().filter(|s| **s == BookState::Open).count(), 2);
    assert_eq!(
        states.iter().filter(|s| **s == BookState::Upcoming).count(),
        1
    );
    // Sorted by the book's first day.
    assert!(ps.windows(2).all(|w| w[0].book_open <= w[1].book_open));
    let tickers: BTreeSet<&str> = u.issues.iter().map(|i| i.ticker.as_str()).collect();
    let mut issuers = BTreeSet::new();
    for p in &ps {
        let what = format!("seed {} {}", u.seed, p.ticker);
        // A new series of an issuer rated BB or better, each issuer once.
        assert!(!tickers.contains(p.ticker.as_str()), "{what}");
        assert!(p.ticker.starts_with(&u.issuers[p.issuer].code), "{what}");
        assert!(
            p.issuer >= 1 && p.rating <= 11 && p.rating == u.issuers[p.issuer].rating,
            "{what}"
        );
        assert!(issuers.insert(p.issuer), "{what}");
        // The book: working days, in order, where its state says.
        assert!(
            weekday(u, p.book_open) < 5
                && weekday(u, p.book_close) < 5
                && weekday(u, p.settlement) < 5,
            "{what}"
        );
        assert!(p.book_open <= p.book_close, "{what}");
        match p.state {
            BookState::Closed => assert!(p.book_close < 0, "{what}"),
            BookState::Open => assert!(p.book_open <= 0 && p.book_close >= 0, "{what}"),
            BookState::Upcoming => assert!(p.book_open > 0, "{what}"),
        }
        assert_eq!(
            working_days_between(u, p.book_close, p.settlement),
            SETTLES_AFTER,
            "{what}"
        );
        assert_eq!(
            p.maturity,
            synth_iso(today(u) + p.settlement + 365 * p.term_years as i64),
            "{what}"
        );
        // The guidance: on its step, half a point to a point wide, near the
        // curve plus the spreads.
        assert!(
            on_step(p.guidance_low_pct) && on_step(p.guidance_high_pct),
            "{what}"
        );
        let width = p.guidance_high_pct - p.guidance_low_pct;
        assert!(
            (0.5 - 1e-9..=1.0 + 1e-9).contains(&width),
            "{what}: {width}"
        );
        let curve = u.inputs.curve.at(p.term_years as f64);
        assert!(
            p.guidance_high_pct > curve - 1.0 && p.guidance_high_pct < curve + 12.0,
            "{what}"
        );
        // The final coupon and the allotment, once the book has closed.
        match p.state {
            BookState::Closed => {
                let demand = p.demand.unwrap();
                assert!((0.8..=3.6).contains(&demand), "{what}");
                let c = p.final_coupon_pct.unwrap();
                assert!(
                    c >= p.guidance_low_pct - 1e-9 && c <= p.guidance_high_pct + 1e-9 && on_step(c),
                    "{what}"
                );
                assert_eq!(
                    c,
                    final_coupon(p.guidance_low_pct, p.guidance_high_pct, demand)
                );
                assert_eq!(p.allotted_pct.unwrap(), allotted(demand));
            }
            _ => assert!(
                p.demand.is_none() && p.final_coupon_pct.is_none() && p.allotted_pct.is_none(),
                "{what}"
            ),
        }
    }
}

fn synth_iso(epoch_day: i64) -> String {
    // The date of an epoch day, as tyche-yield's calendar writes it.
    let (y, m, d) = tyche_yield::date::civil_from_days(epoch_day);
    format!("{y:04}-{m:02}-{d:02}")
}

#[test]
fn the_default_universe_places_four_issues_by_the_rules() {
    let u = synth::generate(synth::DEFAULT_SEED, &inputs::fallback()).unwrap();
    check_rules(&u);
}

#[test]
fn other_seeds_place_by_the_same_rules() {
    for seed in 1..=40 {
        check_rules(&synth::generate(seed, &inputs::fallback()).unwrap());
    }
}

#[test]
fn more_demand_never_raises_the_coupon_or_the_allotment() {
    let mut last = (f64::INFINITY, f64::INFINITY);
    for k in 0..=40 {
        let demand = 0.5 + k as f64 * 0.1;
        let now = (final_coupon(13.5, 14.3, demand), allotted(demand));
        assert!(
            now.0 <= last.0 + 1e-9 && now.1 <= last.1 + 1e-9,
            "demand {demand}"
        );
        last = now;
    }
    assert!((final_coupon(13.5, 14.3, FULL_DEMAND) - 13.5).abs() < 1e-9);
}

#[test]
fn the_placements_are_the_same_on_every_run_and_pinned() {
    let u = synth::generate(synth::DEFAULT_SEED, &inputs::fallback()).unwrap();
    let a = json::placements_json(&u, &placements(&u));
    let again = synth::generate(synth::DEFAULT_SEED, &inputs::fallback()).unwrap();
    assert_eq!(a, json::placements_json(&again, &placements(&again)));
    // Pinned, so a change to the rules is seen and explained.
    assert_eq!(
        format!("{:016x}", json::fnv1a(a.as_bytes())),
        "e6a8b0f082769cb2"
    );
}
