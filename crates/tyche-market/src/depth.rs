//! A depth check: how much of a limit order the visible book would fill
//! at once, at or better than the limit.
//!
//! The order takes the opposite side best price first, as an aggressive
//! order executes ([`crate::synth`]'s day executes its trades the same
//! way): a buy takes the asks from the lowest up while they are at or
//! below the limit, a sell the bids from the highest down while they are
//! at or above it. What is not filled would rest on the book at the limit.
//! Only the visible size is counted: no hidden orders, and nothing that
//! arrives while the order is sent.

use crate::book::Levels;
use crate::message::{Price, Side};

/// What a depth check finds.
#[derive(Debug, Clone, PartialEq)]
pub struct DepthCheck {
    /// The order's size, bonds.
    pub requested: u64,
    /// Bonds filled at once at or better than the limit, and the rest.
    pub filled: u64,
    pub left: u64,
    /// The best opposite price, before the order; `None` on an empty side.
    pub best: Option<Price>,
    /// The size-weighted average fill price, in price units; `None` when
    /// nothing fills.
    pub average: Option<f64>,
    /// The last price level the order reaches.
    pub worst: Option<Price>,
    /// Price levels the order takes from, fully or in part.
    pub levels_used: usize,
    /// How much worse than the best price the average is, in basis points
    /// of the best price: `(average - best) / best * 10,000` for a buy,
    /// `(best - average) / best * 10,000` for a sell. Zero when everything
    /// fills at the best price; `None` when nothing fills.
    pub slippage_bp: Option<f64>,
    /// Each level taken: its price and the bonds taken there, best first.
    pub fills: Vec<(Price, u64)>,
}

/// Checks a limit order of `quantity` bonds against the visible book.
/// `side` is the order's own side; `limit` is in the book's price units.
pub fn depth_check(levels: &Levels, side: Side, quantity: u64, limit: Price) -> DepthCheck {
    let opposite: Box<dyn Iterator<Item = (&Price, &u64)>> = match side {
        Side::Buy => Box::new(levels.asks.iter()),
        Side::Sell => Box::new(levels.bids.iter().rev()),
    };
    let mut opposite = opposite.peekable();
    let best = opposite.peek().map(|(p, _)| **p);
    let acceptable = |p: Price| match side {
        Side::Buy => p <= limit,
        Side::Sell => p >= limit,
    };
    let mut left = quantity;
    let mut fills = Vec::new();
    let mut value = 0.0;
    for (&price, &size) in opposite {
        if left == 0 || !acceptable(price) {
            break;
        }
        let take = left.min(size);
        if take == 0 {
            continue;
        }
        fills.push((price, take));
        value += price as f64 * take as f64;
        left -= take;
    }
    let filled = quantity - left;
    let average = (filled > 0).then(|| value / filled as f64);
    let slippage_bp = match (average, best) {
        (Some(a), Some(b)) if b != 0 => Some(match side {
            Side::Buy => (a - b as f64) / b as f64 * 10_000.0,
            Side::Sell => (b as f64 - a) / b as f64 * 10_000.0,
        }),
        _ => None,
    };
    DepthCheck {
        requested: quantity,
        filled,
        left,
        best,
        average,
        worst: fills.last().map(|(p, _)| *p),
        levels_used: fills.len(),
        slippage_bp,
        fills,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn book() -> Levels {
        Levels {
            bids: BTreeMap::from([(990_000, 30), (995_000, 20), (999_000, 10)]),
            asks: BTreeMap::from([(1_001_000, 10), (1_005_000, 20), (1_010_000, 30)]),
        }
    }

    #[test]
    fn a_buy_takes_the_asks_up_to_its_limit() {
        // 25 bonds with the limit at 100.5 percent: 10 at 100.1, 15 at
        // 100.5. Average (10 x 1,001,000 + 15 x 1,005,000) / 25 =
        // 1,003,400 units; 2,400 over the best 1,001,000 is 23.976 bp.
        let c = depth_check(&book(), Side::Buy, 25, 1_005_000);
        assert_eq!((c.filled, c.left, c.levels_used), (25, 0, 2));
        assert_eq!(c.fills, vec![(1_001_000, 10), (1_005_000, 15)]);
        assert_eq!(c.average, Some(1_003_400.0));
        assert!((c.slippage_bp.unwrap() - 2_400.0 / 1_001_000.0 * 10_000.0).abs() < 1e-9);
        // 100 bonds at the same limit: the 30 visible to 100.5, 70 left.
        let c = depth_check(&book(), Side::Buy, 100, 1_005_000);
        assert_eq!((c.filled, c.left, c.worst), (30, 70, Some(1_005_000)));
    }

    #[test]
    fn a_sell_takes_the_bids_down_to_its_limit() {
        // 10 at 99.9 fills at the best: no slippage.
        let c = depth_check(&book(), Side::Sell, 10, 999_000);
        assert_eq!((c.filled, c.levels_used, c.slippage_bp), (10, 1, Some(0.0)));
        // Below the best bid nothing is acceptable to a limit above it.
        let c = depth_check(&book(), Side::Sell, 10, 999_500);
        assert_eq!(
            (c.filled, c.left, c.average, c.slippage_bp),
            (0, 10, None, None)
        );
        assert_eq!(c.best, Some(999_000));
    }

    #[test]
    fn an_empty_side_fills_nothing() {
        let c = depth_check(&Levels::default(), Side::Buy, 5, 2_000_000);
        assert_eq!((c.filled, c.best, c.levels_used), (0, None, 0));
    }
}
