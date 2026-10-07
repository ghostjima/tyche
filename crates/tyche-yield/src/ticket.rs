//! An order ticket's figures: the yield at a limit price, or the price at
//! a limit yield, for a number of lots, with the accrued interest the
//! buyer pays the seller and the broker's fee.
//!
//! A bond is quoted at a clean price in percent of its nominal; the
//! buyer also pays the accrued interest, so one bond costs the clean
//! price plus the accrued interest (the dirty price). The yields are
//! solved from the flows at that dirty price, as [`derive_bond`] solves
//! them at the issue's own price. A limit yield is a yield to the nearest
//! event (the offer when there is one, maturity otherwise), as the
//! issue's quoted yield is.

use crate::calculate::check_fee;
use crate::issue::{derive_bond, Error, Event, Issue, Market};
use crate::primitives::{price_from_yield, ytm_effective};

/// Which way the order goes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Buy,
    Sell,
}

impl Side {
    /// `"buy"` or `"sell"`.
    pub fn code(self) -> &'static str {
        match self {
            Side::Buy => "buy",
            Side::Sell => "sell",
        }
    }

    /// The side for a code, `None` for an unknown code.
    pub fn from_code(code: &str) -> Option<Side> {
        match code {
            "buy" => Some(Side::Buy),
            "sell" => Some(Side::Sell),
            _ => None,
        }
    }
}

/// What the limit is set in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Limit {
    /// A clean price in percent of the nominal.
    Price,
    /// An annual effective yield to the nearest event, in percent.
    Yield,
}

impl Limit {
    /// `"price"` or `"yield"`.
    pub fn code(self) -> &'static str {
        match self {
            Limit::Price => "price",
            Limit::Yield => "yield",
        }
    }

    /// The limit for a code, `None` for an unknown code.
    pub fn from_code(code: &str) -> Option<Limit> {
        match code {
            "price" => Some(Limit::Price),
            "yield" => Some(Limit::Yield),
            _ => None,
        }
    }
}

/// A limit order as the ticket takes it.
#[derive(Clone, Debug, PartialEq)]
pub struct Order {
    pub side: Side,
    pub limit: Limit,
    /// The clean price in percent of the nominal ([`Limit::Price`]), or
    /// the yield to the nearest event in percent a year, annual effective
    /// ([`Limit::Yield`]).
    pub limit_value: f64,
    /// Lots ordered: a whole number of at least one.
    pub lots: f64,
    /// Bonds in a lot: a whole number of at least one.
    pub lot_size: f64,
    /// The price step in percent of the nominal; 0 for none. A limit
    /// price must be on it; a price found from a limit yield is put on
    /// it, down for a buy and up for a sell, so the order's yield is
    /// never worse for the one who sets it than the limit.
    pub tick_pct: f64,
    /// The broker's fee in percent of the amount traded.
    pub fee_pct: f64,
}

/// What an order costs or brings, and the yields at its price.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ticket {
    /// Bonds traded: `lots * lot_size`.
    pub bonds: f64,
    /// The order's clean price, percent of the nominal: the limit price,
    /// or the price found from the limit yield, on the price step.
    pub clean_pct: f64,
    /// Per bond: `nominal * clean_pct / 100`.
    pub clean: f64,
    /// Accrued interest per bond: the issue's quoted one, else the one
    /// computed from the schedule.
    pub accrued: f64,
    /// `clean + accrued`: one bond's price.
    pub dirty: f64,
    /// `bonds * clean`, `bonds * accrued` and `bonds * dirty`.
    pub clean_amount: f64,
    pub accrued_amount: f64,
    pub amount: f64,
    /// The broker's fee on the amount: `amount * fee_pct / 100`.
    pub fee: f64,
    /// What the buyer pays (`amount + fee`), or what the seller receives
    /// (`amount - fee`).
    pub total: f64,
    /// Yields at `dirty`, as fractions: to maturity, to the nearest offer
    /// (issues with an offer after the valuation date only), and to the
    /// nearest event.
    pub ytm_maturity: f64,
    pub ytm_offer: Option<f64>,
    pub event: Event,
    pub event_day: f64,
    pub yield_event: f64,
    /// The yield to the nearest event at the price after the fee: one
    /// bond's price plus its share of the fee for a buy, less it for a
    /// sell (the yield the seller gives up by selling at what the sale
    /// brings).
    pub yield_event_after_fee: f64,
}

/// A whole number of at least one.
fn whole(x: f64) -> bool {
    x.is_finite() && x >= 1.0 && x.fract() == 0.0
}

/// How close to a whole number of steps a limit price must be, in steps:
/// a price typed in percent with a few decimals is a binary fraction a
/// little off its step.
const ON_TICK: f64 = 1e-9;

/// Works out an order ticket. Errors: those of [`derive_bond`], then, in
/// this order, [`Error::InvalidQuantity`] (lots or the lot size not a
/// whole number of at least one), [`Error::InvalidLimit`] (a price that is
/// not a positive finite number; a yield that is not a finite number above
/// -99 percent, or that gives a clean price that is not positive),
/// [`Error::InvalidTick`] (a price step that is not a finite number of at
/// least zero), [`Error::PriceOffTick`] (a limit price that is not on the
/// price step), and [`Error::InvalidFee`].
pub fn order_ticket(issue: &Issue, market: &Market, order: &Order) -> Result<Ticket, Error> {
    let d = derive_bond(issue, market)?;
    if !whole(order.lots) || !whole(order.lot_size) {
        return Err(Error::InvalidQuantity);
    }
    let accrued = issue.accrued.unwrap_or(d.accrued);
    let tick = order.tick_pct;
    let tick_ok = tick.is_finite() && tick >= 0.0;
    let clean_pct = match order.limit {
        Limit::Price => {
            let p = order.limit_value;
            if !(p.is_finite() && p > 0.0) {
                return Err(Error::InvalidLimit);
            }
            if !tick_ok {
                return Err(Error::InvalidTick);
            }
            if tick > 0.0 {
                let steps = p / tick;
                if (steps - steps.round()).abs() > ON_TICK {
                    return Err(Error::PriceOffTick);
                }
            }
            p
        }
        Limit::Yield => {
            let y = order.limit_value;
            if !(y.is_finite() && y > -99.0) {
                return Err(Error::InvalidLimit);
            }
            let flows = d.flows_to_offer.as_ref().unwrap_or(&d.flows);
            let dirty = price_from_yield(&flows.amounts(), &flows.days, y / 100.0);
            let exact = (dirty - accrued) / issue.nominal * 100.0;
            if !(exact.is_finite() && exact > 0.0) {
                return Err(Error::InvalidLimit);
            }
            if !tick_ok {
                return Err(Error::InvalidTick);
            }
            if tick == 0.0 {
                exact
            } else {
                // Down for a buy, up for a sell: a lower price is a higher
                // yield, so neither side gets less than the yield it set.
                let steps = match order.side {
                    Side::Buy => (exact / tick + ON_TICK).floor(),
                    Side::Sell => (exact / tick - ON_TICK).ceil(),
                };
                if steps < 1.0 {
                    return Err(Error::InvalidLimit);
                }
                steps * tick
            }
        }
    };
    check_fee(order.fee_pct)?;

    let bonds = order.lots * order.lot_size;
    let clean = issue.nominal * clean_pct / 100.0;
    let dirty = clean + accrued;
    let amount = bonds * dirty;
    let fee = amount * order.fee_pct / 100.0;
    let total = match order.side {
        Side::Buy => amount + fee,
        Side::Sell => amount - fee,
    };
    let ytm_maturity = ytm_effective(&d.flows.amounts(), &d.flows.days, dirty);
    let ytm_offer = d
        .flows_to_offer
        .as_ref()
        .map(|f| ytm_effective(&f.amounts(), &f.days, dirty));
    let event_flows = d.flows_to_offer.as_ref().unwrap_or(&d.flows);
    let after_fee = match order.side {
        Side::Buy => dirty * (1.0 + order.fee_pct / 100.0),
        Side::Sell => dirty * (1.0 - order.fee_pct / 100.0),
    };
    Ok(Ticket {
        bonds,
        clean_pct,
        clean,
        accrued,
        dirty,
        clean_amount: bonds * clean,
        accrued_amount: bonds * accrued,
        amount,
        fee,
        total,
        ytm_maturity,
        ytm_offer,
        event: d.event,
        event_day: d.event_day,
        yield_event: ytm_offer.unwrap_or(ytm_maturity),
        yield_event_after_fee: ytm_effective(&event_flows.amounts(), &event_flows.days, after_fee),
    })
}
