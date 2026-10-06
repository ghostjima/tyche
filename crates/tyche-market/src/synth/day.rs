//! One trading day of one synthetic issue: its sessions, its order book
//! and its tape.
//!
//! The book is the crate's order-by-order [`OrderBook`], fed the same
//! add, delete and execute messages a feed would carry: before each event
//! the quoting side brings the ladder to its target around a mid price
//! that wanders through the day, and each trade executes against the
//! resting orders, best first. Spreads, depth, the count of trades and
//! their sizes come from the issue's liquidity and the aggregate figures
//! in [`super::calibration`]; the auctions print one uncrossing trade
//! each.

use super::calibration as cal;
use super::det;
use super::rng::{derive, Rng};
use super::universe::{CouponKind, Segment, SynthIssue};
use crate::book::OrderBook;
use crate::message::{Message, Price, Side, Symbol};
use std::collections::BTreeMap;

/// Seconds since midnight, Moscow time.
pub const fn hms(h: u32, m: u32, s: u32) -> u32 {
    h * 3600 + m * 60 + s
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionKind {
    OpeningAuction,
    Morning,
    Main,
    ClosingAuction,
    Evening,
}

impl SessionKind {
    pub fn code(self) -> &'static str {
        match self {
            SessionKind::OpeningAuction => "opening_auction",
            SessionKind::Morning => "morning",
            SessionKind::Main => "main",
            SessionKind::ClosingAuction => "closing_auction",
            SessionKind::Evening => "evening",
        }
    }

    fn continuous(self) -> bool {
        matches!(
            self,
            SessionKind::Morning | SessionKind::Main | SessionKind::Evening
        )
    }
}

/// A session, from `start` to `end` inclusive, seconds since midnight.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Session {
    pub kind: SessionKind,
    pub start: u32,
    pub end: u32,
}

/// The issue's sessions on a day, from the exchange's schedule of the
/// bond market (main trading mode, settlement T+, roubles): an opening
/// auction ends at a random second between :31 and :59 of its last
/// minute, per security. Government issues: the morning session (opening
/// auction 06:50:00, trading 07:00:00 to 08:59:59), the main session
/// (09:00:00 to 18:49:59), the closing auction (18:50:01 to 19:00:00)
/// and the evening session (19:00:01 to 23:49:59). Corporate issues: the
/// morning and evening sessions only when the issue trades in them; the
/// main session opens with an auction (09:00:00 to 09:09:xx) and trades
/// from 09:10:00.
pub fn sessions(issue: &SynthIssue, rng: &mut Rng) -> Vec<Session> {
    let mut out = Vec::new();
    let auction_end = |r: &mut Rng, h: u32, m: u32| hms(h, m, 31 + r.below(29) as u32);
    let s = |kind, start, end| Session { kind, start, end };
    if issue.liquidity.morning {
        out.push(s(
            SessionKind::OpeningAuction,
            hms(6, 50, 0),
            auction_end(rng, 6, 59),
        ));
        out.push(s(SessionKind::Morning, hms(7, 0, 0), hms(8, 59, 59)));
    }
    match issue.segment {
        Segment::Government => out.push(s(SessionKind::Main, hms(9, 0, 0), hms(18, 49, 59))),
        Segment::Corporate => {
            out.push(s(
                SessionKind::OpeningAuction,
                hms(9, 0, 0),
                auction_end(rng, 9, 9),
            ));
            out.push(s(SessionKind::Main, hms(9, 10, 0), hms(18, 49, 59)));
        }
    }
    out.push(s(
        SessionKind::ClosingAuction,
        hms(18, 50, 1),
        hms(19, 0, 0),
    ));
    if issue.liquidity.evening {
        out.push(s(SessionKind::Evening, hms(19, 0, 1), hms(23, 49, 59)));
    }
    out
}

/// Who started a trade.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Aggressor {
    Buyer,
    Seller,
    /// An auction's uncrossing.
    Auction,
}

impl Aggressor {
    pub fn code(self) -> &'static str {
        match self {
            Aggressor::Buyer => "buy",
            Aggressor::Seller => "sell",
            Aggressor::Auction => "auction",
        }
    }
}

/// One print on the tape.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Print {
    /// Milliseconds since midnight, Moscow time.
    pub time_ms: u32,
    /// Units of 0.0001 percent of face.
    pub price: Price,
    /// Bonds.
    pub size: u64,
    pub aggressor: Aggressor,
}

/// The top of the book and the visible size per side at a moment.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Snapshot {
    pub time_ms: u32,
    pub bid: Price,
    pub ask: Price,
    pub bid_depth: u64,
    pub ask_depth: u64,
}

impl Snapshot {
    /// The quoted spread in basis points of the mid price.
    pub fn spread_bp(&self) -> f64 {
        let mid = (self.bid + self.ask) as f64 / 2.0;
        (self.ask - self.bid) as f64 / mid * 10_000.0
    }
}

#[derive(Debug, Clone)]
pub struct Day {
    pub sessions: Vec<Session>,
    pub prints: Vec<Print>,
    /// Every five minutes of continuous trading.
    pub snapshots: Vec<Snapshot>,
    /// The book when the simulation stopped.
    pub book: OrderBook,
    /// Messages applied to the book.
    pub messages: usize,
}

/// Seconds between snapshots.
pub const SNAPSHOT_EVERY_S: u32 = 300;
/// Price levels quoted per side.
pub const LEVELS: usize = 10;

/// A trade size in bonds: log-normal with the calibrated median and 90th
/// percentile, truncated at the largest size.
pub fn trade_size(r: &mut Rng) -> f64 {
    let mu = det::ln(cal::TRADE_SIZE_MEDIAN);
    let sigma = (det::ln(cal::TRADE_SIZE_P90) - mu) / 1.281_551_565_544_600_5;
    loop {
        let x = det::exp(mu + sigma * r.normal());
        if x <= cal::TRADE_SIZE_MAX {
            return x;
        }
    }
}

fn round_lot(x: f64, lot: u32) -> u64 {
    let lot = lot as f64;
    ((x / lot).round().max(1.0) * lot) as u64
}

/// Splits a side's visible size over the levels in whole lots, by
/// weight, so the levels add up to the size rounded to a lot (largest
/// remainders first); every level holds at least one lot.
fn split_depth(depth: f64, weights: &[f64], lot: u32) -> Vec<u64> {
    let lots = (depth / lot as f64).round().max(weights.len() as f64) as u64;
    let sum: f64 = weights.iter().sum();
    let raw: Vec<f64> = weights.iter().map(|w| lots as f64 * w / sum).collect();
    let mut out: Vec<u64> = raw.iter().map(|x| (x.floor() as u64).max(1)).collect();
    let mut order: Vec<usize> = (0..raw.len()).collect();
    order.sort_by(|&a, &b| {
        (raw[b] - raw[b].floor())
            .total_cmp(&(raw[a] - raw[a].floor()))
            .then(a.cmp(&b))
    });
    let mut have: u64 = out.iter().sum();
    let mut k = 0;
    while have < lots {
        out[order[k % order.len()]] += 1;
        have += 1;
        k += 1;
    }
    out.iter().map(|n| n * lot as u64).collect()
}

struct Quoter {
    symbol: Symbol,
    book: OrderBook,
    next_id: i64,
    /// Resting orders by side and price: (id, size).
    orders: [BTreeMap<Price, (i64, u64)>; 2],
    messages: usize,
}

impl Quoter {
    fn apply(&mut self, m: Message) {
        self.book.apply(&m);
        self.messages += 1;
    }

    fn side_index(side: Side) -> usize {
        match side {
            Side::Buy => 0,
            Side::Sell => 1,
        }
    }

    /// Brings one side of the book to the target levels.
    fn set_side(&mut self, side: Side, target: &[(Price, u64)], time: i64) {
        let s = Self::side_index(side);
        let stale: Vec<Price> = self.orders[s]
            .iter()
            .filter(|(p, (_, size))| !target.iter().any(|(tp, ts)| tp == *p && ts == size))
            .map(|(p, _)| *p)
            .collect();
        for p in stale {
            let (id, _) = self.orders[s].remove(&p).expect("listed");
            self.apply(Message::OrderDelete {
                time,
                symbol: self.symbol,
                order_id: id,
            });
        }
        for &(price, size) in target {
            if self.orders[s].contains_key(&price) || size == 0 {
                continue;
            }
            self.next_id += 1;
            let id = self.next_id;
            self.orders[s].insert(price, (id, size));
            self.apply(Message::AddOrder {
                side,
                time,
                symbol: self.symbol,
                order_id: id,
                size: size as u32,
                price,
            });
        }
    }

    /// Executes an aggressive order against the resting side, best price
    /// first; one print per resting order filled.
    fn execute(&mut self, aggressor: Side, size: u64, time_ms: u32, prints: &mut Vec<Print>) {
        let resting = match aggressor {
            Side::Buy => Side::Sell,
            Side::Sell => Side::Buy,
        };
        let s = Self::side_index(resting);
        let mut left = size;
        while left > 0 {
            let best = match resting {
                Side::Sell => self.orders[s].iter().next().map(|(p, v)| (*p, *v)),
                Side::Buy => self.orders[s].iter().next_back().map(|(p, v)| (*p, *v)),
            };
            let Some((price, (id, have))) = best else {
                break;
            };
            let fill = left.min(have);
            self.apply(Message::OrderExecuted {
                time: time_ms as i64,
                symbol: self.symbol,
                order_id: id,
                size: fill as u32,
                price,
                trade_id: prints.len() as i64 + 1,
            });
            if fill == have {
                self.orders[s].remove(&price);
            } else {
                self.orders[s].insert(price, (id, have - fill));
            }
            prints.push(Print {
                time_ms,
                price,
                size: fill,
                aggressor: if aggressor == Side::Buy {
                    Aggressor::Buyer
                } else {
                    Aggressor::Seller
                },
            });
            left -= fill;
        }
    }
}

/// How much wider than its base the spread is at second `t` of a
/// continuous session.
fn widening(session: &Session, t: f64) -> f64 {
    let base = if session.kind == SessionKind::Main {
        1.0
    } else {
        1.0 + cal::OFF_HOURS_WIDENING
    };
    base + cal::OPEN_WIDENING * det::exp(-(t - session.start as f64) / cal::WIDENING_FADE_S)
        + cal::CLOSE_WIDENING * det::exp(-(session.end as f64 - t) / cal::WIDENING_FADE_S)
}

/// Trade intensity over a continuous session, relative: higher at the
/// open and the close, as the spread is wider there.
fn intensity(session: &Session, t: f64) -> f64 {
    1.0 + 1.5 * det::exp(-(t - session.start as f64) / 1_800.0)
        + 1.0 * det::exp(-(session.end as f64 - t) / 1_800.0)
}

/// Simulates the issue's day number `day` (0 is the valuation date), up
/// to `until_ms` (milliseconds since midnight) or the end of the day.
/// `index` is the issue's place in its universe, which with the seed and
/// the day fixes the random sequence.
pub fn simulate(
    seed: u64,
    index: usize,
    issue: &SynthIssue,
    day: u32,
    until_ms: Option<u32>,
) -> Day {
    let mut r = Rng::new(derive(seed, &[4, index as u64, day as u64]));
    let sessions = sessions(issue, &mut r);
    let l = &issue.liquidity;
    let tick = issue.tick;
    let p0 = (issue.engine.price_pct * cal::UNITS_PER_PCT).round();
    // How far the price wanders in a day, units: the yield's volatility
    // times the duration.
    let duration = match issue.kind {
        CouponKind::KeyRate | CouponKind::Ruonia => 0.25,
        _ => issue.duration,
    };
    let vol_bp = if issue.segment == Segment::Government {
        cal::GOV_YIELD_VOL_BP
    } else {
        cal::CORP_YIELD_VOL_BP
    };
    let sigma_day = vol_bp / 10_000.0 * duration * p0;
    let day_s = 32_400.0;

    // The day's trades, spread over the continuous sessions.
    let total = (l.trades_per_day * det::exp(0.05 * r.normal()))
        .round()
        .max(0.0) as usize;
    let continuous: Vec<Session> = sessions
        .iter()
        .copied()
        .filter(|s| s.kind.continuous())
        .collect();
    let shares: Vec<f64> = continuous
        .iter()
        .map(|s| match s.kind {
            SessionKind::Morning => cal::MORNING_SHARE,
            SessionKind::Evening => cal::EVENING_SHARE,
            _ => 1.0,
        })
        .collect();
    let main_share = 1.0 - shares.iter().filter(|&&x| x < 1.0).sum::<f64>();
    let mut times: Vec<u32> = Vec::with_capacity(total + 64);
    let mut assigned = 0;
    for (k, s) in continuous.iter().enumerate() {
        let share = if shares[k] < 1.0 {
            shares[k]
        } else {
            main_share
        };
        let n = if k + 1 == continuous.len() {
            total - assigned
        } else {
            ((total as f64) * share).round() as usize
        };
        let n = n.min(total - assigned);
        assigned += n;
        for _ in 0..n {
            // Rejection sampling under the intensity's ceiling.
            loop {
                let t = r.range(s.start as f64, s.end as f64 + 1.0);
                if r.uniform() * 3.5 < intensity(s, t) {
                    times.push((t * 1000.0) as u32);
                    break;
                }
            }
        }
    }
    times.sort_unstable();

    // Events in time order: requotes at each session's start and at each
    // snapshot, trades, and the auctions' uncrossing.
    #[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
    enum Ev {
        Open(usize),
        Snapshot,
        Trade,
        Uncross(usize),
        Close(usize),
    }
    let mut events: Vec<(u32, Ev)> = times.iter().map(|&t| (t, Ev::Trade)).collect();
    for (k, s) in sessions.iter().enumerate() {
        if s.kind.continuous() {
            events.push((s.start * 1000, Ev::Open(k)));
            events.push((s.end * 1000 + 999, Ev::Close(k)));
            let mut t = s.start - s.start % SNAPSHOT_EVERY_S + SNAPSHOT_EVERY_S;
            while t < s.end {
                events.push((t * 1000, Ev::Snapshot));
                t += SNAPSHOT_EVERY_S;
            }
        } else {
            events.push((s.end * 1000, Ev::Uncross(k)));
        }
    }
    events.sort();

    let mut q = Quoter {
        symbol: Symbol::new(&issue.ticker),
        book: OrderBook::default(),
        next_id: 0,
        orders: [BTreeMap::new(), BTreeMap::new()],
        messages: 0,
    };
    let mut prints = Vec::new();
    let mut snapshots = Vec::new();
    let mut mid = p0;
    let mut last_t = sessions.first().map(|s| s.start as f64).unwrap_or(0.0);
    let mut current: Option<usize> = None;
    // Depth for the session, drawn at its start.
    let mut depth = l.depth;

    let move_mid = |r: &mut Rng, mid: &mut f64, last: &mut f64, t: f64| {
        let dt = (t - *last).max(0.0);
        *mid += sigma_day * (dt / day_s).sqrt() * r.normal();
        // Kept within five percent of the reference price.
        *mid = mid.clamp(p0 * 0.95, p0 * 1.05);
        *last = t;
    };
    let quote = |r: &mut Rng,
                 q: &mut Quoter,
                 mid: f64,
                 session: &Session,
                 t: f64,
                 depth: f64,
                 time_ms: u32| {
        let spread_bp = l.spread_bp * widening(session, t) * det::exp(0.12 * r.normal());
        let ticks = ((spread_bp / 10_000.0 * mid / tick as f64).round() as i64).max(1);
        let bid0 = ((mid - (ticks * tick) as f64 / 2.0) / tick as f64).floor() as i64 * tick;
        let ask0 = bid0 + ticks * tick;
        let step = (ticks / 3).max(1) * tick;
        let weights: Vec<f64> = (0..LEVELS).map(|k| 1.0 + 0.25 * k as f64).collect();
        let sizes = split_depth(depth, &weights, issue.lot);
        let bids: Vec<(Price, u64)> = (0..LEVELS)
            .map(|k| (bid0 - k as i64 * step, sizes[k]))
            .filter(|(p, _)| *p > 0)
            .collect();
        let asks: Vec<(Price, u64)> = (0..LEVELS)
            .map(|k| (ask0 + k as i64 * step, sizes[k]))
            .collect();
        q.set_side(Side::Buy, &bids, time_ms as i64);
        q.set_side(Side::Sell, &asks, time_ms as i64);
    };

    for (time_ms, ev) in events {
        if until_ms.is_some_and(|u| time_ms > u) {
            break;
        }
        let t = time_ms as f64 / 1000.0;
        match ev {
            Ev::Open(k) => {
                current = Some(k);
                // Drawn for the session, within the calibrated range.
                let (lo, hi) = issue.depth_bounds();
                let lot = issue.lot as f64;
                depth = (l.depth * det::exp(0.08 * r.normal())).clamp(lo + lot, hi - lot);
                move_mid(&mut r, &mut mid, &mut last_t, t);
                quote(&mut r, &mut q, mid, &sessions[k], t, depth, time_ms);
            }
            Ev::Close(_) => {
                current = None;
                q.set_side(Side::Buy, &[], time_ms as i64);
                q.set_side(Side::Sell, &[], time_ms as i64);
            }
            Ev::Snapshot | Ev::Trade => {
                let Some(k) = current else { continue };
                move_mid(&mut r, &mut mid, &mut last_t, t);
                quote(&mut r, &mut q, mid, &sessions[k], t, depth, time_ms);
                if ev == Ev::Snapshot {
                    let lv = q.book.levels();
                    let (bid, ask) = lv.best();
                    if let (Some((bid, _)), Some((ask, _))) = (bid, ask) {
                        snapshots.push(Snapshot {
                            time_ms,
                            bid,
                            ask,
                            bid_depth: lv.bids.values().sum(),
                            ask_depth: lv.asks.values().sum(),
                        });
                    }
                } else {
                    let side = if r.chance(0.5) { Side::Buy } else { Side::Sell };
                    let size = round_lot(trade_size(&mut r), issue.lot);
                    q.execute(side, size, time_ms, &mut prints);
                }
            }
            Ev::Uncross(_) => {
                // Orders gathered in the auction: more for a liquid issue.
                let orders = (2.0 + 20.0 * (1.0 - l.rank)).round() as usize;
                let (mut buy, mut sell) = (0.0, 0.0);
                for _ in 0..orders {
                    let size = trade_size(&mut r);
                    if r.chance(0.5) {
                        buy += size;
                    } else {
                        sell += size;
                    }
                }
                let matched = f64::min(buy, sell);
                if matched >= issue.lot as f64 {
                    move_mid(&mut r, &mut mid, &mut last_t, t);
                    let price = (mid / tick as f64).round() as i64 * tick;
                    prints.push(Print {
                        time_ms,
                        price,
                        size: round_lot(matched, issue.lot),
                        aggressor: Aggressor::Auction,
                    });
                }
            }
        }
    }
    Day {
        sessions,
        prints,
        snapshots,
        messages: q.messages,
        book: q.book,
    }
}
