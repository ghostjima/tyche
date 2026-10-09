//! The universe and a day as JSON, for the browser, and their digests.
//! Numbers are written with a fixed count of decimals, so the text (and
//! its digest) does not depend on the last bit of a platform's maths
//! library.

use super::access::{gate, INDEX_BELOW, TEST_BELOW};
use super::day::{Day, Print};
use super::events::HoldingEvent;
use super::placements::Placement;
use super::universe::{Universe, RATINGS};
use crate::depth::DepthCheck;
use std::fmt::Write;

/// A number rounded to `decimals`, without trailing zeros.
fn num(x: f64, decimals: usize) -> String {
    if !x.is_finite() {
        return "null".into();
    }
    let s = format!("{x:.decimals$}");
    let s = if s.contains('.') {
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    } else {
        s
    };
    if s == "-0" {
        "0".into()
    } else {
        s
    }
}

/// A JSON string; the generator's strings are ASCII codes and dates, but
/// quotes and backslashes are escaped all the same.
fn text(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn list<T>(xs: &[T], f: impl Fn(&T) -> String) -> String {
    format!("[{}]", xs.iter().map(f).collect::<Vec<_>>().join(","))
}

pub fn universe_json(u: &Universe) -> String {
    let i = &u.inputs;
    let mut o = String::with_capacity(u.issues.len() * 900);
    let _ = write!(
        o,
        "{{\"seed\":{},\"inputs\":{{\"valuationDate\":{},\"keyRatePct\":{},\"ruoniaPct\":{},\"inflationPct\":{},\"curve\":{{\"termsYears\":{},\"yieldsPct\":{}}}}},",
        u.seed,
        text(&i.valuation_date),
        num(i.key_rate_pct, 4),
        num(i.ruonia_pct, 4),
        num(i.inflation_pct, 4),
        list(&i.curve.terms_years, |x| num(*x, 4)),
        list(&i.curve.yields_pct, |x| num(*x, 4)),
    );
    let _ = write!(
        o,
        "\"issuers\":{},",
        list(&u.issuers, |s| format!(
            "{{\"code\":{},\"place\":{},\"sector\":{},\"rating\":{},\"outlook\":{}}}",
            text(&s.code),
            text(s.place),
            text(s.sector.code()),
            text(RATINGS[s.rating]),
            text(s.outlook.code())
        ))
    );
    o.push_str("\"issues\":[");
    for (k, s) in u.issues.iter().enumerate() {
        if k > 0 {
            o.push(',');
        }
        let issuer = &u.issuers[s.issuer];
        let e = &s.engine;
        let l = &s.liquidity;
        let offer = match &s.offer {
            Some(of) => format!(
                "{{\"date\":{},\"kind\":{}}}",
                text(&of.date),
                text(of.kind.code())
            ),
            None => "null".into(),
        };
        let _ = write!(
            o,
            "{{\"ticker\":{},\"segment\":{},\"issuer\":{},\"place\":{},\"sector\":{},\"rating\":{},\"outlook\":{},\
\"coupon\":{{\"kind\":{},\"indexSpreadPct\":{},\"indexRatio\":{}}},\"offer\":{},\"subordinated\":{},\"qualifiedOnly\":{},\
\"lot\":{},\"tickPct\":{},\"targetYield\":{},\"duration\":{},\
\"liquidity\":{{\"rank\":{},\"spreadBp\":{},\"depth\":{},\"tradesPerDay\":{},\"morning\":{},\"evening\":{}}},\
\"issue\":{{\"nominal\":{},\"pricePct\":{},\"accrued\":null,\"couponType\":{},\"couponRatePct\":{},\"spreadPct\":{},\
\"periodDays\":{},\"maturity\":{},\"offers\":{},\"amortization\":{}}}}}",
            text(&s.ticker),
            text(s.segment.code()),
            text(&issuer.code),
            text(issuer.place),
            text(issuer.sector.code()),
            text(RATINGS[s.rating]),
            text(issuer.outlook.code()),
            text(s.kind.code()),
            num(s.index_spread_pct, 4),
            num(s.index_ratio, 4),
            offer,
            s.subordinated,
            s.qualified_only,
            s.lot,
            num(s.tick as f64 / super::calibration::UNITS_PER_PCT, 4),
            num(s.target_yield, 8),
            num(s.duration, 6),
            num(l.rank, 6),
            num(l.spread_bp, 4),
            num(l.depth.round(), 0),
            num(l.trades_per_day, 2),
            l.morning,
            l.evening,
            num(e.nominal, 2),
            num(e.price_pct, 4),
            text(e.coupon_type.code()),
            num(e.coupon_rate_pct, 4),
            num(e.spread_pct, 4),
            num(e.period_days, 0),
            text(&e.maturity),
            list(&e.offers, |d| text(d)),
            list(&e.amortization, |a| format!("{{\"date\":{},\"fractionPct\":{}}}", text(&a.date), num(a.fraction_pct, 6))),
        );
    }
    o.push_str("]}");
    o
}

fn print_json(p: &Print) -> String {
    format!(
        "[{},{},{},{}]",
        p.time_ms,
        p.price,
        p.size,
        text(p.aggressor.code())
    )
}

/// A day as JSON: the sessions, the tape as `[time_ms, price units, size,
/// aggressor]` rows, the snapshots, and the book's levels when the day
/// stopped (best first, `[price units, size]`).
pub fn day_json(d: &Day, levels: usize) -> String {
    let lv = d.book.levels();
    let bids: Vec<(i64, u64)> = lv
        .bids
        .iter()
        .rev()
        .take(levels)
        .map(|(p, s)| (*p, *s))
        .collect();
    let asks: Vec<(i64, u64)> = lv.asks.iter().take(levels).map(|(p, s)| (*p, *s)).collect();
    format!(
        "{{\"sessions\":{},\"prints\":{},\"snapshots\":{},\"book\":{{\"bids\":{},\"asks\":{}}}}}",
        list(&d.sessions, |s| format!(
            "{{\"kind\":{},\"start\":{},\"end\":{}}}",
            text(s.kind.code()),
            s.start,
            s.end
        )),
        list(&d.prints, print_json),
        list(&d.snapshots, |s| format!(
            "[{},{},{},{},{}]",
            s.time_ms, s.bid, s.ask, s.bid_depth, s.ask_depth
        )),
        list(&bids, |(p, s)| format!("[{p},{s}]")),
        list(&asks, |(p, s)| format!("[{p},{s}]")),
    )
}

/// Who may buy each issue, by ticker, with the reasons, the synthetic
/// rating below which a corporate issue needs a test and the one below
/// which a corporate floater is for qualified investors only (the Bank of
/// Russia board's levels as the synthetic scale reads them):
/// `{"testBelow": "A+", "indexBelow": "AA-", "issues": [{"ticker",
/// "access", "reasons", "test"}]}`, `test` the kind of the broker's test
/// an issue needs, or null.
pub fn access_json(u: &Universe) -> String {
    format!(
        "{{\"testBelow\":{},\"indexBelow\":{},\"issues\":{}}}",
        text(RATINGS[TEST_BELOW]),
        text(RATINGS[INDEX_BELOW]),
        list(&u.issues, |s| {
            let g = gate(s, &u.issuers[s.issuer]);
            format!(
                "{{\"ticker\":{},\"access\":{},\"reasons\":{},\"test\":{}}}",
                text(&s.ticker),
                text(g.access.code()),
                list(&g.reasons, |r| text(r.code())),
                g.test.map_or("null".into(), |k| text(k.code()))
            )
        })
    )
}

fn opt_day(x: Option<i64>) -> String {
    x.map_or("null".into(), |d| d.to_string())
}

/// A holding's events, by day: amounts in currency units to two
/// decimals, days as offsets from the valuation date, ratings as names.
pub fn events_json(events: &[HoldingEvent]) -> String {
    list(events, |e| {
        format!(
            "{{\"kind\":{},\"source\":{},\"day\":{},\"date\":{},\"perBond\":{},\"amount\":{},\"projected\":{},\"windowFrom\":{},\"windowTo\":{},\"noticeDay\":{},\"ratingFrom\":{},\"ratingTo\":{}}}",
            text(e.kind.code()),
            text(e.source.code()),
            e.day,
            text(&e.date),
            num(e.per_bond, 4),
            num(e.amount, 2),
            e.projected,
            opt_day(e.window.map(|w| w.0)),
            opt_day(e.window.map(|w| w.1)),
            opt_day(e.notice_day),
            e.rating.map_or("null".into(), |r| text(RATINGS[r.0])),
            e.rating.map_or("null".into(), |r| text(RATINGS[r.1])),
        )
    })
}

fn opt_num(x: Option<f64>, decimals: usize) -> String {
    x.map_or("null".into(), |x| num(x, decimals))
}

/// The placements: days as offsets from the valuation date, coupons in
/// percent a year, the size in roubles of face value; the issuer by its
/// code with its place and sector, and the issuer's rating and outlook.
pub fn placements_json(u: &Universe, placements: &[Placement]) -> String {
    list(placements, |p| {
        let s = &u.issuers[p.issuer];
        format!(
            "{{\"ticker\":{},\"issuer\":{},\"place\":{},\"sector\":{},\"rating\":{},\"outlook\":{},\"state\":{},\"bookOpen\":{},\"bookClose\":{},\"settlement\":{},\"maturity\":{},\"termYears\":{},\"periodDays\":{},\"size\":{},\"guidanceLowPct\":{},\"guidanceHighPct\":{},\"demand\":{},\"finalCouponPct\":{},\"allottedPct\":{}}}",
            text(&p.ticker),
            text(&s.code),
            text(s.place),
            text(s.sector.code()),
            text(RATINGS[p.rating]),
            text(s.outlook.code()),
            text(p.state.code()),
            p.book_open,
            p.book_close,
            p.settlement,
            text(&p.maturity),
            p.term_years,
            num(p.period_days, 0),
            num(p.size, 0),
            num(p.guidance_low_pct, 2),
            num(p.guidance_high_pct, 2),
            opt_num(p.demand, 2),
            opt_num(p.final_coupon_pct, 2),
            opt_num(p.allotted_pct, 1),
        )
    })
}

/// A depth check, prices in the book's units.
pub fn depth_json(c: &DepthCheck) -> String {
    let price = |p: Option<i64>| p.map_or("null".into(), |p| p.to_string());
    format!(
        "{{\"requested\":{},\"filled\":{},\"left\":{},\"best\":{},\"average\":{},\"worst\":{},\"levelsUsed\":{},\"slippageBp\":{},\"fills\":{}}}",
        c.requested,
        c.filled,
        c.left,
        price(c.best),
        c.average.map_or("null".into(), |a| num(a, 4)),
        price(c.worst),
        c.levels_used,
        c.slippage_bp.map_or("null".into(), |s| num(s, 4)),
        list(&c.fills, |(p, s)| format!("[{p},{s}]")),
    )
}

/// FNV-1a, 64 bits.
pub fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// The digest of a universe: of its JSON.
pub fn universe_digest(u: &Universe) -> u64 {
    fnv1a(universe_json(u).as_bytes())
}

/// The digest of a day's tape.
pub fn tape_digest(d: &Day) -> u64 {
    let mut s = String::with_capacity(d.prints.len() * 24);
    for p in &d.prints {
        s.push_str(&print_json(p));
        s.push('\n');
    }
    fnv1a(s.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_are_written_rounded_and_short() {
        assert_eq!(num(1.0, 4), "1");
        assert_eq!(num(98.12345, 4), "98.1235");
        assert_eq!(num(-0.00001, 4), "0");
        assert_eq!(num(f64::NAN, 2), "null");
        assert_eq!(text("a\"b"), "\"a\\\"b\"");
        assert_eq!(fnv1a(b""), 0xcbf2_9ce4_8422_2325);
    }
}
