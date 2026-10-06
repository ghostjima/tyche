//! The universe and a day as JSON, for the browser, and their digests.
//! Numbers are written with a fixed count of decimals, so the text (and
//! its digest) does not depend on the last bit of a platform's maths
//! library.

use super::day::{Day, Print};
use super::universe::{Universe, RATINGS};
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
            "{{\"code\":{},\"place\":{},\"sector\":{},\"rating\":{}}}",
            text(&s.code),
            text(s.place),
            text(s.sector.code()),
            text(RATINGS[s.rating])
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
            "{{\"ticker\":{},\"segment\":{},\"issuer\":{},\"place\":{},\"sector\":{},\"rating\":{},\
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
