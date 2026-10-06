//! The aggregate figures the synthetic market is calibrated on, and the
//! assumptions added where the figures say nothing.
//!
//! Source of the figures: the Moscow Exchange's delayed ISS snapshot of
//! the bond market on 2026-10-06, reduced to aggregates across issues
//! (medians, percentiles, ranges). No per-security series is kept here
//! or anywhere in this repository. The trading sessions follow the
//! exchange's published schedule of the bond market
//! (https://www.moex.com/s1167, read on 2026-10-06), which is a
//! timetable, not market data.
//!
//! Prices are in units of 0.0001 percent of face value, so every tick
//! below is a whole number of units.

/// Price units per percent of face value.
pub const UNITS_PER_PCT: f64 = 10_000.0;

/// Price step of government issues: 0.001 percent of face.
pub const GOV_TICK: i64 = 10;
/// Price steps of corporate issues: 0.01 percent of face for most, 0.0001
/// percent for some.
pub const CORP_TICK: i64 = 100;
pub const CORP_FINE_TICK: i64 = 1;
/// Share of corporate issues on the fine step (an assumption).
pub const CORP_FINE_TICK_SHARE: f64 = 0.15;

/// Lot sizes: one bond for most issues; some corporate issues trade in
/// lots of 100 or 1,000 (the shares are assumptions).
pub const LOT_100_SHARE: f64 = 0.06;
pub const LOT_1000_SHARE: f64 = 0.03;

/// The quoted spread across issues, as (cumulative share, basis points of
/// the mid price) knots of a distribution, log-linear between knots.
/// Government: median 3.2, 10th percentile 0.2, 90th percentile 14.6
/// (measured); the ends are assumptions.
pub const GOV_SPREAD_BP: [(f64, f64); 5] =
    [(0.0, 0.1), (0.1, 0.2), (0.5, 3.2), (0.9, 14.6), (1.0, 40.0)];
/// Corporate: median 25, 10th percentile 3, a long tail to about 1,000
/// (measured); the 90th percentile and the lower end are assumptions.
pub const CORP_SPREAD_BP: [(f64, f64); 5] = [
    (0.0, 1.0),
    (0.1, 3.0),
    (0.5, 25.0),
    (0.9, 200.0),
    (1.0, 1000.0),
];

/// Visible depth per side, in bonds: 0.3 to 1.3 million on the liquid
/// government issues and 6 to 80 thousand on corporate issues
/// (measured). The less liquid half of the government issues gets 50 to
/// 300 thousand (an assumption).
pub const GOV_LIQUID_DEPTH: (f64, f64) = (300_000.0, 1_300_000.0);
pub const GOV_ILLIQUID_DEPTH: (f64, f64) = (50_000.0, 300_000.0);
pub const CORP_DEPTH: (f64, f64) = (6_000.0, 80_000.0);

/// Trades a day: 5 to 10 thousand on the top government issues, up to
/// about a thousand on corporate issues (measured). How many issues are
/// "top" (five) and how the rest fall off are assumptions.
pub const GOV_TOP_ISSUES: usize = 5;
pub const GOV_TOP_TRADES: (f64, f64) = (5_000.0, 10_000.0);
pub const CORP_MAX_TRADES: f64 = 1_000.0;

/// Trade size in bonds: heavy-tailed, median 3, 90th percentile 158, the
/// largest about 15,700 (measured). Drawn from a log-normal with that
/// median and 90th percentile, truncated at the largest size.
pub const TRADE_SIZE_MEDIAN: f64 = 3.0;
pub const TRADE_SIZE_P90: f64 = 158.0;
pub const TRADE_SIZE_MAX: f64 = 15_700.0;

/// How much wider the spread is at the start and the end of a continuous
/// session, and how fast that fades, in seconds (assumptions: the
/// figures only say spreads are wider at the open and the close).
pub const OPEN_WIDENING: f64 = 1.5;
pub const CLOSE_WIDENING: f64 = 0.8;
pub const WIDENING_FADE_S: f64 = 1_200.0;
/// The morning and evening sessions quote this much wider (assumption).
pub const OFF_HOURS_WIDENING: f64 = 1.0;
/// Share of the day's trades in the morning and the evening sessions,
/// where an issue trades in them (assumptions).
pub const MORNING_SHARE: f64 = 0.04;
pub const EVENING_SHARE: f64 = 0.08;

/// Daily volatility of an issue's yield, in basis points (assumptions).
pub const GOV_YIELD_VOL_BP: f64 = 6.0;
pub const CORP_YIELD_VOL_BP: f64 = 10.0;
