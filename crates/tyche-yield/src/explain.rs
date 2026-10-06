//! The working behind an issue's figures, for a screen that shows it: how
//! the dirty price is made of the clean price and the accrued interest,
//! how the yields to maturity and to the offer are solved from the cash
//! flows, the yields after a broker's fee, what holding to each event
//! leaves after tax and the fee without reinvesting anything, the
//! G-spread of each yield to the zero-coupon curve, and the tax year by
//! year.

use crate::calculate::{check_fee, check_plan, Hold, Sale, TaxYear};
use crate::date::parse_iso_date;
use crate::issue::{derive_bond, Error, Issue, Market, Schedule};
use crate::primitives::{ytm_effective, YEAR};
use crate::spread::{spread_of, Curve, GSpread};
use crate::{Breakdown, Plan};

/// How the dirty price of one bond is made.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PriceTrace {
    pub nominal: f64,
    /// Clean price, percent of the nominal.
    pub clean_pct: f64,
    /// `nominal * clean_pct / 100`.
    pub clean: f64,
    /// The coupon rate of the current period, percent a year (for a
    /// floater, today's key rate plus its spread).
    pub coupon_rate_pct: f64,
    pub period_days: f64,
    /// The current period's coupon on the full nominal: `nominal *
    /// coupon_rate_pct / 100 * period_days / 365`.
    pub coupon_amount: f64,
    /// Days since the last coupon.
    pub days_since_last: f64,
    /// `coupon_amount * days_since_last / period_days`.
    pub accrued_computed: f64,
    /// The accrued interest the issue quotes, when it quotes one.
    pub accrued_quoted: Option<f64>,
    /// The accrued interest in the price: the quoted one, else the
    /// computed one.
    pub accrued: f64,
    /// `clean + accrued`: what one bond costs.
    pub dirty: f64,
}

/// One cash flow discounted at the solved yield.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FlowTrace {
    /// Day offset from the valuation date.
    pub day: f64,
    /// `day / 365`.
    pub years: f64,
    pub coupon: f64,
    pub principal: f64,
    /// `coupon + principal`.
    pub amount: f64,
    /// `(1 + yield) ^ -years`.
    pub factor: f64,
    /// `amount * factor`.
    pub present_value: f64,
}

/// The yield to one event (maturity, or redemption at the offer), worked
/// out, and what holding to it leaves.
#[derive(Clone, Debug, PartialEq)]
pub struct YieldTrace {
    /// The day of the last flow: maturity, or the coupon day on which the
    /// offer redeems the bond.
    pub event_day: f64,
    pub flows: Vec<FlowTrace>,
    /// The annual effective yield that makes the flows' present value the
    /// dirty price (as a fraction).
    pub ytm: f64,
    /// The flows' present value at `ytm`: the dirty price, back.
    pub present_value: f64,
    /// The dirty price with the broker's fee on the purchase.
    pub price_with_fee: f64,
    /// The yield solved at `price_with_fee`.
    pub ytm_after_fee: f64,
    /// The G-spread of `ytm` to the zero-coupon curve, at the Macaulay
    /// duration of these flows.
    pub g_spread: GSpread,
    /// The plan's amount held to the event: nothing reinvested, the fee
    /// on the purchase, tax in the plan's account with the plan's other
    /// income. Its `annual_pct` is the yield after tax and the fee without
    /// reinvestment: the deposit rate that gives the same total.
    pub held: Breakdown,
    /// The tax of `held`, year by year.
    pub tax: Vec<TaxYear>,
}

/// Everything [`explain`] works out.
#[derive(Clone, Debug, PartialEq)]
pub struct Explanation {
    /// The broker's fee asked for, percent of each trade.
    pub fee_pct: f64,
    pub price: PriceTrace,
    pub to_maturity: YieldTrace,
    /// Issues with an offer after the valuation date only.
    pub to_offer: Option<YieldTrace>,
    /// The plan as [`calculate`](crate::calculate) gives it with the same
    /// fee: the same as its `plan`.
    pub plan: Breakdown,
    /// The plan's tax, year by year; the years' `tax` add up to
    /// `-plan.tax`.
    pub plan_tax: Vec<TaxYear>,
}

/// Works out an issue's figures for a plan, a broker's fee in percent of
/// each trade and the zero-coupon curve the G-spreads are taken against.
/// Errors as [`calculate`](crate::calculate), then [`Error::InvalidFee`]
/// for a fee that is not a finite number of at least zero, then the
/// curve's ([`Curve::check`]).
pub fn explain(
    issue: &Issue,
    market: &Market,
    plan: &Plan,
    fee_pct: f64,
    curve: &Curve,
) -> Result<Explanation, Error> {
    let d = derive_bond(issue, market)?;
    let qty = check_plan(&d, plan)?;
    check_fee(fee_pct)?;
    curve.check()?;
    let today = parse_iso_date(&market.valuation_date).ok_or(Error::InvalidDate)?;
    let ctx = Context {
        qty,
        dirty_price: d.dirty_price,
        accrued_paid: issue.accrued.unwrap_or(d.accrued),
        nominal: issue.nominal,
        today,
        period_days: issue.period_days,
        exit_yield: d.ytm_maturity,
        fee_pct,
    };
    let clean = issue.nominal * issue.price_pct / 100.0;
    let price = PriceTrace {
        nominal: issue.nominal,
        clean_pct: issue.price_pct,
        clean,
        coupon_rate_pct: d.rates_pct.first().copied().unwrap_or(0.0),
        period_days: issue.period_days,
        coupon_amount: d.coupon_amount,
        days_since_last: d.days_since_last,
        accrued_computed: d.accrued,
        accrued_quoted: issue.accrued,
        accrued: issue.accrued.unwrap_or(d.accrued),
        dirty: d.dirty_price,
    };

    let held_plan = Plan {
        reinvest: false,
        ..plan.clone()
    };
    let trace = |flows: &Schedule, ytm: f64| -> YieldTrace {
        let event_day = flows.days.last().copied().unwrap_or(0.0);
        let traced: Vec<FlowTrace> = flows
            .days
            .iter()
            .enumerate()
            .map(|(i, &day)| {
                let years = day / YEAR;
                let amount = flows.coupons[i] + flows.principals[i];
                let factor = (1.0 + ytm).powf(-years);
                FlowTrace {
                    day,
                    years,
                    coupon: flows.coupons[i],
                    principal: flows.principals[i],
                    amount,
                    factor,
                    present_value: amount * factor,
                }
            })
            .collect();
        let present_value = traced.iter().fold(0.0, |sum, f| sum + f.present_value);
        let price_with_fee = d.dirty_price * (1.0 + fee_pct / 100.0);
        let (held, _, tax) =
            holding(&ctx, 0.0, &held_plan).traced(flows, event_day, Sale::Shifted(0.0));
        YieldTrace {
            event_day,
            flows: traced,
            ytm,
            present_value,
            price_with_fee,
            ytm_after_fee: ytm_effective(&flows.amounts(), &flows.days, price_with_fee),
            g_spread: spread_of(flows, ytm, curve),
            held,
            tax,
        }
    };

    let to_maturity = trace(&d.flows, d.ytm_maturity);
    let to_offer = match (&d.flows_to_offer, d.ytm_offer) {
        (Some(flows), Some(ytm)) => Some(trace(flows, ytm)),
        _ => None,
    };
    let reinvest_rate = if plan.reinvest { d.ytm_maturity } else { 0.0 };
    let (plan_breakdown, _, plan_tax) =
        holding(&ctx, reinvest_rate, plan).traced(&d.flows, plan.horizon_day, Sale::Shifted(0.0));

    Ok(Explanation {
        fee_pct,
        price,
        to_maturity,
        to_offer,
        plan: plan_breakdown,
        plan_tax,
    })
}

/// What every holding of one issue and plan shares.
struct Context {
    qty: f64,
    dirty_price: f64,
    accrued_paid: f64,
    nominal: f64,
    today: i64,
    period_days: f64,
    exit_yield: f64,
    fee_pct: f64,
}

fn holding<'a>(c: &Context, reinvest_rate: f64, plan: &'a Plan) -> Hold<'a> {
    Hold {
        qty: c.qty,
        dirty_price: c.dirty_price,
        accrued_paid: c.accrued_paid,
        nominal: c.nominal,
        today: c.today,
        period_days: c.period_days,
        reinvest_rate,
        exit_yield: c.exit_yield,
        commission_pct: c.fee_pct,
        plan,
    }
}
