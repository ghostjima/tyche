//! The synthetic market: determinism, the engine's round trip on every
//! issue, the calibration figures, the sessions, and the absence of real
//! identifiers.

use std::sync::OnceLock;
use tyche_market::synth::{
    self, calibration as cal, inputs, json, Aggressor, CouponKind, Day, OfferKind, Segment,
    SessionKind, Universe, RATINGS,
};
use tyche_yield::derive_bond;

fn universe() -> &'static Universe {
    static U: OnceLock<Universe> = OnceLock::new();
    U.get_or_init(|| synth::generate(synth::DEFAULT_SEED, &inputs::fallback()).unwrap())
}

/// Every issue's first day, simulated once for the tests that need it.
fn days() -> &'static Vec<Day> {
    static D: OnceLock<Vec<Day>> = OnceLock::new();
    D.get_or_init(|| {
        let u = universe();
        u.issues
            .iter()
            .enumerate()
            .map(|(i, s)| synth::simulate(u.seed, i, s, 0, None))
            .collect()
    })
}

/// Nearest-rank percentile.
fn pct(xs: &[f64], p: f64) -> f64 {
    let mut s = xs.to_vec();
    s.sort_by(f64::total_cmp);
    s[((p * (s.len() - 1) as f64).round()) as usize]
}

fn within(what: &str, x: f64, lo: f64, hi: f64) {
    assert!((lo..=hi).contains(&x), "{what}: {x} not in [{lo}, {hi}]");
}

const MIDDAY_MS: u32 = 13 * 3_600_000;

#[test]
fn the_same_seed_gives_the_same_universe_and_day_and_another_seed_does_not() {
    let u = universe();
    let again = synth::generate(synth::DEFAULT_SEED, &inputs::fallback()).unwrap();
    assert_eq!(&again, u);
    let other = synth::generate(synth::DEFAULT_SEED + 1, &inputs::fallback()).unwrap();
    assert_ne!(json::universe_digest(&other), json::universe_digest(u));
    // Pinned, so a change to the generator is seen and explained. Integer
    // arithmetic and the crate's own exp and ln keep these the same on
    // every platform.
    assert_eq!(
        format!("{:016x}", json::universe_digest(u)),
        "b4cd2d72f1ea47ba"
    );
    let a = synth::simulate(u.seed, 0, &u.issues[0], 0, None);
    let b = synth::simulate(u.seed, 0, &u.issues[0], 0, None);
    assert_eq!(a.prints, b.prints);
    assert_eq!(
        format!("{:016x}", json::tape_digest(&a)),
        "f328664d750cbba9"
    );
    // Another day of the same issue is another tape.
    let c = synth::simulate(u.seed, 0, &u.issues[0], 1, None);
    assert_ne!(json::tape_digest(&c), json::tape_digest(&a));
}

#[test]
fn the_universe_holds_every_kind_of_issue() {
    let u = universe();
    within("issues", u.issues.len() as f64, 150.0, 300.0);
    let count = |seg: Segment, f: &dyn Fn(&synth::SynthIssue) -> bool| {
        u.issues.iter().filter(|s| s.segment == seg && f(s)).count()
    };
    for seg in [Segment::Government, Segment::Corporate] {
        for kind in [
            CouponKind::Fixed,
            CouponKind::KeyRate,
            CouponKind::Ruonia,
            CouponKind::Linker,
        ] {
            assert!(count(seg, &|s| s.kind == kind) > 0, "{seg:?} {kind:?}");
        }
        assert!(
            count(seg, &|s| !s.engine.amortization.is_empty()) > 0,
            "{seg:?} amortising"
        );
    }
    let corp = Segment::Corporate;
    assert!(
        count(corp, &|s| s
            .offer
            .as_ref()
            .is_some_and(|o| o.kind == OfferKind::Put))
            > 0
    );
    assert!(
        count(corp, &|s| s
            .offer
            .as_ref()
            .is_some_and(|o| o.kind == OfferKind::Call))
            > 0
    );
    assert!(count(corp, &|s| s.subordinated) > 0);
    assert!(count(corp, &|s| s.qualified_only) > 0);
    assert!(count(corp, &|s| s.lot == 100) > 0 && count(corp, &|s| s.lot == 1000) > 0);
    assert!(count(corp, &|s| s.tick == cal::CORP_FINE_TICK) > 0);
    // Every subordinated issue is for qualified investors only, and rated
    // below its issuer.
    for s in u.issues.iter().filter(|s| s.subordinated) {
        assert!(s.qualified_only, "{}", s.ticker);
        assert!(
            s.rating > u.issuers[s.issuer].rating || s.rating == RATINGS.len() - 1,
            "{}",
            s.ticker
        );
    }
    // Ticks and lots as calibrated.
    for s in &u.issues {
        match s.segment {
            Segment::Government => assert!(s.tick == cal::GOV_TICK && s.lot == 1, "{}", s.ticker),
            Segment::Corporate => assert!(
                [cal::CORP_TICK, cal::CORP_FINE_TICK].contains(&s.tick),
                "{}",
                s.ticker
            ),
        }
        let units = (s.engine.price_pct * cal::UNITS_PER_PCT).round() as i64;
        assert_eq!(units % s.tick, 0, "{} price off its tick", s.ticker);
    }
}

#[test]
fn the_engine_finds_each_issues_yield_back_from_its_price() {
    let u = universe();
    let market = synth::SynthIssue::market(&u.inputs);
    for s in &u.issues {
        let d = derive_bond(&s.engine, &market).unwrap_or_else(|e| panic!("{}: {e}", s.ticker));
        // The price sits on its tick, so the yield can be off by what half
        // a tick moves it: half a tick over the dirty price and the
        // duration.
        let dirty_pct = d.dirty_price / s.engine.nominal * 100.0;
        let tick_pct = s.tick as f64 / cal::UNITS_PER_PCT;
        let bound = 1.1 * (tick_pct / 2.0) / (dirty_pct * s.duration) + 1e-9;
        let off = (d.yield_event - s.target_yield).abs();
        assert!(
            off <= bound,
            "{}: engine {} target {} (bound {bound})",
            s.ticker,
            d.yield_event,
            s.target_yield
        );
        // And the target is the curve at the duration plus a spread that
        // fits the issue: near the curve for the government, above it for
        // corporates (a linker's yield is real, less inflation).
        let real = if s.kind == CouponKind::Linker {
            u.inputs.inflation_pct
        } else {
            0.0
        };
        assert!(s.target_yield > 0.0 && s.target_yield < 0.5, "{}", s.ticker);
        let spread =
            s.target_yield * 100.0 + real - u.inputs.curve.at(2.0).min(u.inputs.curve.at(30.0));
        assert!(spread > -6.0, "{}: {spread}", s.ticker);
    }
}

#[test]
fn quoted_spreads_across_issues_match_the_calibration() {
    let u = universe();
    for (seg, (p10, p50, p90), max) in [
        (
            Segment::Government,
            ((0.1, 0.35), (2.4, 4.2), (10.0, 20.0)),
            (15.0, 60.0),
        ),
        (
            Segment::Corporate,
            ((2.0, 5.0), (18.0, 33.0), (100.0, 300.0)),
            (400.0, 1_100.0),
        ),
    ] {
        let spreads: Vec<f64> = u
            .issues
            .iter()
            .zip(days())
            .filter(|(s, _)| s.segment == seg)
            .map(|(_, d)| {
                d.snapshots
                    .iter()
                    .find(|x| x.time_ms == MIDDAY_MS)
                    .expect("a midday snapshot")
                    .spread_bp()
            })
            .collect();
        within(&format!("{seg:?} p10"), pct(&spreads, 0.1), p10.0, p10.1);
        within(&format!("{seg:?} median"), pct(&spreads, 0.5), p50.0, p50.1);
        within(&format!("{seg:?} p90"), pct(&spreads, 0.9), p90.0, p90.1);
        within(&format!("{seg:?} max"), pct(&spreads, 1.0), max.0, max.1);
    }
}

#[test]
fn spreads_are_wider_at_the_open_and_the_close() {
    let mut open = 0.0;
    let mut mid = 0.0;
    let mut close = 0.0;
    for d in days() {
        let main = d
            .sessions
            .iter()
            .find(|s| s.kind == SessionKind::Main)
            .unwrap();
        let at = |t: u32| {
            d.snapshots
                .iter()
                .find(|x| x.time_ms == t * 1000)
                .map(|x| x.spread_bp())
        };
        // The first and the last snapshot of the main session.
        let first = (main.start + 1..main.end).find(|t| t % 300 == 0).unwrap();
        let last = (main.start..main.end).rev().find(|t| t % 300 == 0).unwrap();
        open += at(first).unwrap();
        close += at(last).unwrap();
        mid += at(MIDDAY_MS / 1000).unwrap();
    }
    assert!(open > 1.8 * mid, "open {open} mid {mid}");
    assert!(close > 1.2 * mid, "close {close} mid {mid}");
}

#[test]
fn visible_depth_per_side_matches_the_calibration() {
    let u = universe();
    for (s, d) in u.issues.iter().zip(days()) {
        let (lo, hi) = s.depth_bounds();
        for x in &d.snapshots {
            within(
                &format!("{} bid depth", s.ticker),
                x.bid_depth as f64,
                lo,
                hi,
            );
            within(
                &format!("{} ask depth", s.ticker),
                x.ask_depth as f64,
                lo,
                hi,
            );
        }
    }
    // The liquid government range is the measured one.
    assert_eq!(cal::GOV_LIQUID_DEPTH, (300_000.0, 1_300_000.0));
    assert_eq!(cal::CORP_DEPTH, (6_000.0, 80_000.0));
}

#[test]
fn trades_a_day_match_the_calibration() {
    let u = universe();
    let mut gov: Vec<(f64, usize)> = Vec::new();
    let mut corp_max = 0;
    for (s, d) in u.issues.iter().zip(days()) {
        match s.segment {
            Segment::Government => gov.push((s.liquidity.rank, d.prints.len())),
            Segment::Corporate => corp_max = corp_max.max(d.prints.len()),
        }
    }
    gov.sort_by(|a, b| a.0.total_cmp(&b.0));
    for (_, n) in gov.iter().take(cal::GOV_TOP_ISSUES) {
        within("top government trades", *n as f64, 5_000.0, 10_000.0);
    }
    within("most traded corporate", corp_max as f64, 500.0, 1_100.0);
}

#[test]
fn trade_sizes_are_heavy_tailed_as_calibrated() {
    let u = universe();
    let sizes: Vec<f64> = u
        .issues
        .iter()
        .zip(days())
        .filter(|(s, _)| s.lot == 1)
        .flat_map(|(_, d)| {
            d.prints
                .iter()
                .filter(|p| p.aggressor != Aggressor::Auction)
                .map(|p| p.size as f64)
        })
        .collect();
    assert!(sizes.len() > 50_000, "{}", sizes.len());
    within("median size", pct(&sizes, 0.5), 2.0, 4.0);
    within("90th percentile size", pct(&sizes, 0.9), 110.0, 220.0);
    within(
        "largest size",
        pct(&sizes, 1.0),
        3_000.0,
        cal::TRADE_SIZE_MAX,
    );
}

#[test]
fn trades_fall_inside_the_sessions_and_the_book_stays_consistent() {
    let u = universe();
    for (s, d) in u.issues.iter().zip(days()) {
        assert_eq!(d.book.anomalies, Default::default(), "{}", s.ticker);
        for p in &d.prints {
            let t = p.time_ms / 1000;
            let session = d.sessions.iter().find(|x| x.start <= t && t <= x.end);
            let session =
                session.unwrap_or_else(|| panic!("{} print at {t} outside the sessions", s.ticker));
            if p.aggressor == Aggressor::Auction {
                assert!(matches!(
                    session.kind,
                    SessionKind::OpeningAuction | SessionKind::ClosingAuction
                ));
                assert_eq!(t, session.end);
            } else {
                assert!(matches!(
                    session.kind,
                    SessionKind::Morning | SessionKind::Main | SessionKind::Evening
                ));
            }
            assert_eq!(p.price % s.tick, 0, "{} print off its tick", s.ticker);
            assert_eq!(p.size % s.lot as u64, 0, "{} print off its lot", s.ticker);
        }
        // The book is empty after the last session.
        assert_eq!(d.book.order_count(), 0, "{}", s.ticker);
        let kinds: Vec<SessionKind> = d.sessions.iter().map(|x| x.kind).collect();
        match s.segment {
            Segment::Government => assert_eq!(
                kinds,
                [
                    SessionKind::OpeningAuction,
                    SessionKind::Morning,
                    SessionKind::Main,
                    SessionKind::ClosingAuction,
                    SessionKind::Evening
                ]
            ),
            Segment::Corporate => assert!(
                kinds.contains(&SessionKind::OpeningAuction)
                    && kinds.contains(&SessionKind::ClosingAuction)
            ),
        }
    }
    // The most liquid issues open with an auction trade.
    let (i, _) = u
        .issues
        .iter()
        .enumerate()
        .min_by(|a, b| a.1.liquidity.rank.total_cmp(&b.1.liquidity.rank))
        .unwrap();
    assert!(days()[i]
        .prints
        .iter()
        .any(|p| p.aggressor == Aggressor::Auction));
}

#[test]
fn a_day_stopped_early_shows_the_book_at_that_moment() {
    let u = universe();
    let d = synth::simulate(u.seed, 0, &u.issues[0], 0, Some(MIDDAY_MS));
    let (bid, ask) = d.book.levels().best();
    let (bid, ask) = (bid.unwrap().0, ask.unwrap().0);
    assert!(bid < ask);
    assert!(d.prints.iter().all(|p| p.time_ms <= MIDDAY_MS));
    let full = &days()[0];
    assert_eq!(&full.prints[..d.prints.len()], &d.prints[..]);
}

/// Real names this universe must never use: issuers on the Russian bond
/// market, the federal government's borrower, rating agencies and data
/// vendors, in Latin and Cyrillic.
pub const REAL_NAMES: &[&str] = &[
    "minfin",
    "ministry of finance",
    "минфин",
    "министерство финансов",
    "ofz",
    "офз",
    "sber",
    "сбер",
    "vtb",
    "втб",
    "gazprom",
    "газпром",
    "rosneft",
    "роснефт",
    "lukoil",
    "лукойл",
    "rzd",
    "ржд",
    "russian railways",
    "rostelecom",
    "ростелеком",
    "mts",
    "мтс",
    "magnit",
    "магнит",
    "segezha",
    "сегежа",
    "samolet",
    "самолет",
    "самолёт",
    "pik",
    "пик",
    "sistema",
    "систем",
    "norilsk",
    "норильск",
    "nornickel",
    "nlmk",
    "нлмк",
    "severstal",
    "северсталь",
    "mmk",
    "ммк",
    "evraz",
    "евраз",
    "polyus",
    "полюс",
    "alrosa",
    "алроса",
    "rusal",
    "русал",
    "metalloinvest",
    "металлоинвест",
    "akron",
    "акрон",
    "phosagro",
    "фосагро",
    "sibur",
    "сибур",
    "novatek",
    "новатэк",
    "transneft",
    "транснефть",
    "rushydro",
    "русгидро",
    "rosseti",
    "россети",
    "inter rao",
    "интер рао",
    "aeroflot",
    "аэрофлот",
    "x5",
    "ozon",
    "озон",
    "yandex",
    "яндекс",
    "vk",
    "tinkoff",
    "тинькофф",
    "t-bank",
    "т-банк",
    "alfa",
    "альфа",
    "gazprombank",
    "газпромбанк",
    "sovcombank",
    "совкомбанк",
    "otkritie",
    "открытие",
    "psb",
    "псб",
    "domrf",
    "дом.рф",
    "dom.rf",
    "vebrf",
    "вэб",
    "europlan",
    "европлан",
    "gtlk",
    "гтлк",
    "baltic leasing",
    "балтийский лизинг",
    "evrotrans",
    "евротранс",
    "akra",
    "акра",
    "expert ra",
    "эксперт ра",
    "nkr",
    "нкр",
    "nra",
    "нра",
    "cbonds",
    "moex",
    "мосбирж",
    "uralsib",
    "уралсиб",
    "kubanenergo",
    "кубаньэнерго",
    "volgatelecom",
    "волгателеком",
];

#[test]
fn nothing_in_the_universe_is_a_real_identifier() {
    let u = universe();
    let text = json::universe_json(u);
    // Every quoted string: none has the shape of an ISIN (two letters,
    // nine letters or digits, a check digit).
    let isin = |s: &str| {
        s.len() == 12
            && s[..2].bytes().all(|b| b.is_ascii_uppercase())
            && s[2..11]
                .bytes()
                .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
            && s.as_bytes()[11].is_ascii_digit()
    };
    let strings: Vec<&str> = text.split('"').skip(1).step_by(2).collect();
    assert!(strings.len() > 1_000);
    for s in &strings {
        assert!(!isin(s), "{s} looks like an ISIN");
    }
    for s in &u.issues {
        assert!(
            s.ticker.len() <= 8
                && s.ticker
                    .bytes()
                    .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'-'),
            "{}",
            s.ticker
        );
        // Not a federal loan bond number: those are five digits (26xxx,
        // 29xxx, 46xxx, 52xxx); the synthetic series are three.
        let digits: String = s.ticker.chars().filter(|c| c.is_ascii_digit()).collect();
        assert!(digits.len() <= 3, "{}", s.ticker);
        if s.segment == Segment::Government {
            assert!(s.ticker.starts_with("SG-") && u.issuers[s.issuer].code == "SGT");
        }
        // Ratings are the synthetic scale, with no agency suffix.
        assert!(RATINGS.contains(&synth::RATINGS[s.rating]));
    }
    let lower = text.to_lowercase();
    for name in REAL_NAMES {
        // Codes are short; look for the name as a whole word.
        let found = lower.match_indices(name).any(|(at, _)| {
            let before = lower[..at]
                .chars()
                .next_back()
                .is_none_or(|c| !c.is_alphanumeric());
            let after = lower[at + name.len()..]
                .chars()
                .next()
                .is_none_or(|c| !c.is_alphanumeric());
            before && after
        });
        assert!(!found, "{name} appears in the universe");
    }
    for suffix in ["(ru)", "ru)", ".ru\"", "|ru"] {
        assert!(!lower.contains(suffix), "{suffix}");
    }
}
