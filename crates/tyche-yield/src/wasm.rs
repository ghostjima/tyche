//! JavaScript bindings (feature `wasm`).
//!
//! The primitives take and return `Float64Array`s and numbers under their
//! Rust names. `derive_bond`, `calculate` and `explain` take and return
//! wasm-bindgen structs with camelCase fields (`Issue`, `Market` and `Plan`
//! in; `DeriveResult`, `CalculateResult` and `ExplainResult` out, each with
//! `ok` or `error` set). Codes cross as strings: an unknown coupon type or tax regime is
//! the error `invalid_code`. `g_spread` and `explain` take a `Curve`;
//! `undefined` or `null` in its place is the error `curve_missing`.
//!
//! Structs rather than JSON: on the 60-issue set the struct boundary
//! added 4 to 6 percent to the time spent inside wasm, the JSON boundary
//! 36 to 41 percent (docs/MEASUREMENTS.md).

use crate::primitives as p;
use crate::{
    Amortization, Breakdown, Calculation, CouponType, Curve, Derived, Error, Explanation,
    FlowTrace, GSpread, GSpreads, Issue, Market, Plan, PriceTrace, Schedule, TaxRegime, TaxYear,
    YieldTrace,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn price_from_yield(amounts: &[f64], days: &[f64], y: f64) -> f64 {
    p::price_from_yield(amounts, days, y)
}

#[wasm_bindgen]
pub fn ytm_effective(amounts: &[f64], days: &[f64], price: f64) -> f64 {
    p::ytm_effective(amounts, days, price)
}

#[wasm_bindgen]
pub fn ytm_simple(amounts: &[f64], days: &[f64], price: f64) -> f64 {
    p::ytm_simple(amounts, days, price)
}

#[wasm_bindgen]
pub fn accrued_interest(coupon: f64, days_since_last: f64, period_days: f64) -> f64 {
    p::accrued_interest(coupon, days_since_last, period_days)
}

#[wasm_bindgen]
pub fn macaulay_duration(amounts: &[f64], days: &[f64], y: f64) -> f64 {
    p::macaulay_duration(amounts, days, y)
}

#[wasm_bindgen]
pub fn modified_duration(amounts: &[f64], days: &[f64], y: f64) -> f64 {
    p::modified_duration(amounts, days, y)
}

#[allow(clippy::too_many_arguments)]
#[wasm_bindgen]
pub fn build_cash_flow(
    nominal: f64,
    period_days: f64,
    coupon_days: &[f64],
    coupon_rates_pct: &[f64],
    amort_days: &[f64],
    amort_fracs: &[f64],
    offer_day: f64,
    offer_mode: u32,
    post_offer_rate_pct: f64,
) -> Vec<f64> {
    p::build_cash_flow(
        nominal,
        period_days,
        coupon_days,
        coupon_rates_pct,
        amort_days,
        amort_fracs,
        offer_day,
        offer_mode,
        post_offer_rate_pct,
    )
}

#[wasm_bindgen]
pub fn floater_rate_path(base_pct: f64, delta_pct: f64, ramp_steps: u32, n: u32) -> Vec<f64> {
    p::floater_rate_path(base_pct, delta_pct, ramp_steps, n)
}

#[wasm_bindgen]
pub fn floater_coupons(
    nominal: f64,
    spread_pct: f64,
    key_rates_pct: &[f64],
    period_days: f64,
) -> Vec<f64> {
    p::floater_coupons(nominal, spread_pct, key_rates_pct, period_days)
}

#[wasm_bindgen]
pub fn income_tax(base: f64, other_income: f64) -> f64 {
    p::income_tax(base, other_income)
}

#[wasm_bindgen]
pub fn hold_value(
    days: &[f64],
    coupons: &[f64],
    principals: &[f64],
    horizon_day: f64,
    reinvest_rate: f64,
    exit_yield: f64,
) -> Vec<f64> {
    p::hold_value(
        days,
        coupons,
        principals,
        horizon_day,
        reinvest_rate,
        exit_yield,
    )
    .to_vec()
}

#[wasm_bindgen]
pub fn periodic_rate_pct(y: f64, period_days: f64) -> f64 {
    p::periodic_rate_pct(y, period_days)
}

#[wasm_bindgen]
pub fn value_along_path(
    days: &[f64],
    amounts: &[f64],
    horizon_day: f64,
    period_days: f64,
    rates_pct: &[f64],
) -> f64 {
    p::value_along_path(days, amounts, horizon_day, period_days, rates_pct)
}

#[wasm_bindgen]
pub fn price_after_rate_shift(price: f64, mod_duration: f64, delta_pct: f64) -> f64 {
    p::price_after_rate_shift(price, mod_duration, delta_pct)
}

#[wasm_bindgen]
pub fn curve_yield_pct(terms_years: &[f64], yields_pct: &[f64], years: f64) -> f64 {
    p::curve_yield_pct(terms_years, yields_pct, years)
}

#[wasm_bindgen]
pub fn effective_annual_pct(invested: f64, total: f64, horizon_day: f64) -> f64 {
    crate::effective_annual_pct(invested, total, horizon_day)
}

#[wasm_bindgen(js_name = Issue, getter_with_clone)]
#[derive(Clone, Default)]
pub struct JsIssue {
    pub nominal: f64,
    #[wasm_bindgen(js_name = pricePct)]
    pub price_pct: f64,
    pub accrued: Option<f64>,
    #[wasm_bindgen(js_name = couponType)]
    pub coupon_type: String,
    #[wasm_bindgen(js_name = couponRatePct)]
    pub coupon_rate_pct: f64,
    #[wasm_bindgen(js_name = spreadPct)]
    pub spread_pct: f64,
    #[wasm_bindgen(js_name = periodDays)]
    pub period_days: f64,
    pub maturity: String,
    pub offers: Vec<String>,
    #[wasm_bindgen(js_name = amortDates)]
    pub amort_dates: Vec<String>,
    #[wasm_bindgen(js_name = amortFractionsPct)]
    pub amort_fractions_pct: Vec<f64>,
}

#[wasm_bindgen(js_class = Issue)]
impl JsIssue {
    #[wasm_bindgen(constructor)]
    pub fn new() -> JsIssue {
        JsIssue::default()
    }
}

#[wasm_bindgen(js_name = Market, getter_with_clone)]
#[derive(Clone, Default)]
pub struct JsMarket {
    #[wasm_bindgen(js_name = valuationDate)]
    pub valuation_date: String,
    #[wasm_bindgen(js_name = keyRatePct)]
    pub key_rate_pct: f64,
}

#[wasm_bindgen(js_class = Market)]
impl JsMarket {
    #[wasm_bindgen(constructor)]
    pub fn new() -> JsMarket {
        JsMarket::default()
    }
}

#[wasm_bindgen(js_name = Plan, getter_with_clone)]
#[derive(Clone, Default)]
pub struct JsPlan {
    pub amount: f64,
    #[wasm_bindgen(js_name = horizonDay)]
    pub horizon_day: f64,
    pub reinvest: bool,
    #[wasm_bindgen(js_name = taxRegime)]
    pub tax_regime: String,
    #[wasm_bindgen(js_name = otherIncome)]
    pub other_income: f64,
    #[wasm_bindgen(js_name = rateShiftPct)]
    pub rate_shift_pct: f64,
}

#[wasm_bindgen(js_class = Plan)]
impl JsPlan {
    #[wasm_bindgen(constructor)]
    pub fn new() -> JsPlan {
        JsPlan::default()
    }
}

#[wasm_bindgen(js_name = Curve, getter_with_clone)]
#[derive(Clone, Default)]
pub struct JsCurve {
    #[wasm_bindgen(js_name = termsYears)]
    pub terms_years: Vec<f64>,
    #[wasm_bindgen(js_name = yieldsPct)]
    pub yields_pct: Vec<f64>,
}

#[wasm_bindgen(js_class = Curve)]
impl JsCurve {
    #[wasm_bindgen(constructor)]
    pub fn new() -> JsCurve {
        JsCurve::default()
    }
}

/// The curve given, or an empty one for `undefined` or `null`, which the
/// engine's check reports as `curve_missing` in its place among the
/// checks. The curve is taken by value: wasm-bindgen consumes the
/// JavaScript object, which must not be used or freed after the call.
fn curve_of(c: Option<JsCurve>) -> Curve {
    c.map_or_else(Curve::default, |c| Curve {
        terms_years: c.terms_years,
        yields_pct: c.yields_pct,
    })
}

fn issue_of(i: &JsIssue) -> Result<Issue, Error> {
    Ok(Issue {
        nominal: i.nominal,
        price_pct: i.price_pct,
        accrued: i.accrued,
        coupon_type: CouponType::from_code(&i.coupon_type).ok_or(Error::InvalidCode)?,
        coupon_rate_pct: i.coupon_rate_pct,
        spread_pct: i.spread_pct,
        period_days: i.period_days,
        maturity: i.maturity.clone(),
        offers: i.offers.clone(),
        amortization: i
            .amort_dates
            .iter()
            .enumerate()
            .map(|(k, d)| Amortization {
                date: d.clone(),
                fraction_pct: i.amort_fractions_pct.get(k).copied().unwrap_or(f64::NAN),
            })
            .collect(),
    })
}

fn market_of(m: &JsMarket) -> Market {
    Market {
        valuation_date: m.valuation_date.clone(),
        key_rate_pct: m.key_rate_pct,
    }
}

fn plan_of(p: &JsPlan) -> Result<Plan, Error> {
    Ok(Plan {
        amount: p.amount,
        horizon_day: p.horizon_day,
        reinvest: p.reinvest,
        tax_regime: TaxRegime::from_code(&p.tax_regime).ok_or(Error::InvalidCode)?,
        other_income: p.other_income,
        rate_shift_pct: p.rate_shift_pct,
    })
}

#[wasm_bindgen(js_name = Schedule, getter_with_clone)]
#[derive(Clone)]
pub struct JsSchedule {
    pub days: Vec<f64>,
    pub coupons: Vec<f64>,
    pub principals: Vec<f64>,
}

impl From<&Schedule> for JsSchedule {
    fn from(s: &Schedule) -> JsSchedule {
        JsSchedule {
            days: s.days.clone(),
            coupons: s.coupons.clone(),
            principals: s.principals.clone(),
        }
    }
}

#[wasm_bindgen(js_name = Derived, getter_with_clone)]
#[derive(Clone)]
pub struct JsDerived {
    #[wasm_bindgen(js_name = maturityDay)]
    pub maturity_day: f64,
    #[wasm_bindgen(js_name = couponDays)]
    pub coupon_days: Vec<f64>,
    #[wasm_bindgen(js_name = ratesPct)]
    pub rates_pct: Vec<f64>,
    #[wasm_bindgen(js_name = amortDays)]
    pub amort_days: Vec<f64>,
    #[wasm_bindgen(js_name = amortFracs)]
    pub amort_fracs: Vec<f64>,
    #[wasm_bindgen(js_name = daysSinceLast)]
    pub days_since_last: f64,
    #[wasm_bindgen(js_name = couponAmount)]
    pub coupon_amount: f64,
    pub accrued: f64,
    #[wasm_bindgen(js_name = dirtyPrice)]
    pub dirty_price: f64,
    pub flows: JsSchedule,
    #[wasm_bindgen(js_name = flowsToOffer)]
    pub flows_to_offer: Option<JsSchedule>,
    #[wasm_bindgen(js_name = offerDay)]
    pub offer_day: Option<f64>,
    #[wasm_bindgen(js_name = ytmMaturity)]
    pub ytm_maturity: f64,
    #[wasm_bindgen(js_name = ytmOffer)]
    pub ytm_offer: Option<f64>,
    #[wasm_bindgen(js_name = ytmSimple)]
    pub ytm_simple: f64,
    pub event: String,
    #[wasm_bindgen(js_name = eventDay)]
    pub event_day: f64,
    #[wasm_bindgen(js_name = yieldEvent)]
    pub yield_event: f64,
    pub macaulay: f64,
    pub modified: f64,
}

impl From<Derived> for JsDerived {
    fn from(d: Derived) -> JsDerived {
        JsDerived {
            maturity_day: d.maturity_day,
            flows: (&d.flows).into(),
            flows_to_offer: d.flows_to_offer.as_ref().map(Into::into),
            coupon_days: d.coupon_days,
            rates_pct: d.rates_pct,
            amort_days: d.amort_days,
            amort_fracs: d.amort_fracs,
            days_since_last: d.days_since_last,
            coupon_amount: d.coupon_amount,
            accrued: d.accrued,
            dirty_price: d.dirty_price,
            offer_day: d.offer_day,
            ytm_maturity: d.ytm_maturity,
            ytm_offer: d.ytm_offer,
            ytm_simple: d.ytm_simple,
            event: d.event.code().to_owned(),
            event_day: d.event_day,
            yield_event: d.yield_event,
            macaulay: d.macaulay,
            modified: d.modified,
        }
    }
}

#[wasm_bindgen(js_name = DeriveResult, getter_with_clone)]
pub struct JsDeriveResult {
    pub ok: Option<JsDerived>,
    pub error: Option<String>,
}

#[wasm_bindgen(js_name = Breakdown)]
#[derive(Clone, Copy)]
pub struct JsBreakdown {
    pub qty: f64,
    pub invested: f64,
    pub coupons: f64,
    pub reinvest: f64,
    pub amort: f64,
    pub body: f64,
    pub tax: f64,
    pub commission: f64,
    pub total: f64,
    pub profit: f64,
    #[wasm_bindgen(js_name = periodPct)]
    pub period_pct: f64,
    #[wasm_bindgen(js_name = annualPct)]
    pub annual_pct: Option<f64>,
    #[wasm_bindgen(js_name = horizonDay)]
    pub horizon_day: f64,
}

impl From<Breakdown> for JsBreakdown {
    fn from(b: Breakdown) -> JsBreakdown {
        JsBreakdown {
            qty: b.qty,
            invested: b.invested,
            coupons: b.coupons,
            reinvest: b.reinvest,
            amort: b.amort,
            body: b.body,
            tax: b.tax,
            commission: b.commission,
            total: b.total,
            profit: b.profit,
            period_pct: b.period_pct,
            annual_pct: b.annual_pct,
            horizon_day: b.horizon_day,
        }
    }
}

#[wasm_bindgen(js_name = EarlyExit)]
#[derive(Clone, Copy)]
pub struct JsEarlyExit {
    #[wasm_bindgen(js_name = rateShiftPct)]
    pub rate_shift_pct: f64,
    pub applicable: bool,
    pub result: JsBreakdown,
    pub diff: f64,
    #[wasm_bindgen(js_name = modDurationAtHorizon)]
    pub mod_duration_at_horizon: Option<f64>,
}

#[wasm_bindgen(js_name = FloaterScenario, getter_with_clone)]
#[derive(Clone)]
pub struct JsFloaterScenario {
    #[wasm_bindgen(js_name = shiftPct)]
    pub shift_pct: f64,
    pub breakdown: JsBreakdown,
    pub coupons: Vec<f64>,
}

#[wasm_bindgen(js_name = FloaterScenarios, getter_with_clone)]
#[derive(Clone)]
pub struct JsFloaterScenarios {
    pub days: Vec<f64>,
    pub scenarios: Vec<JsFloaterScenario>,
}

#[wasm_bindgen(js_name = OfferPair)]
#[derive(Clone, Copy)]
pub struct JsOfferPair {
    pub before: JsBreakdown,
    pub after: JsBreakdown,
}

#[wasm_bindgen(js_name = Calculation, getter_with_clone)]
#[derive(Clone)]
pub struct JsCalculation {
    pub plan: JsBreakdown,
    #[wasm_bindgen(js_name = earlyExit)]
    pub early_exit: JsEarlyExit,
    pub floater: Option<JsFloaterScenarios>,
    pub offer: Option<JsOfferPair>,
}

impl From<Calculation> for JsCalculation {
    fn from(c: Calculation) -> JsCalculation {
        JsCalculation {
            plan: c.plan.into(),
            early_exit: JsEarlyExit {
                rate_shift_pct: c.early_exit.rate_shift_pct,
                applicable: c.early_exit.applicable,
                result: c.early_exit.result.into(),
                diff: c.early_exit.diff,
                mod_duration_at_horizon: c.early_exit.mod_duration_at_horizon,
            },
            floater: c.floater.map(|f| JsFloaterScenarios {
                days: f.days,
                scenarios: f
                    .scenarios
                    .into_iter()
                    .map(|s| JsFloaterScenario {
                        shift_pct: s.shift_pct,
                        breakdown: s.breakdown.into(),
                        coupons: s.coupons,
                    })
                    .collect(),
            }),
            offer: c.offer.map(|o| JsOfferPair {
                before: o.before.into(),
                after: o.after.into(),
            }),
        }
    }
}

#[wasm_bindgen(js_name = CalculateResult, getter_with_clone)]
pub struct JsCalculateResult {
    pub ok: Option<JsCalculation>,
    pub error: Option<String>,
}

/// Derives an issue in a market.
#[wasm_bindgen]
pub fn derive_bond(issue: &JsIssue, market: &JsMarket) -> JsDeriveResult {
    match issue_of(issue).and_then(|i| crate::derive_bond(&i, &market_of(market))) {
        Ok(d) => JsDeriveResult {
            ok: Some(d.into()),
            error: None,
        },
        Err(e) => JsDeriveResult {
            ok: None,
            error: Some(e.code().to_owned()),
        },
    }
}

/// Calculates a plan for an issue in a market.
#[wasm_bindgen]
pub fn calculate(issue: &JsIssue, market: &JsMarket, plan: &JsPlan) -> JsCalculateResult {
    let r = issue_of(issue)
        .and_then(|i| Ok((i, plan_of(plan)?)))
        .and_then(|(i, pl)| crate::calculate(&i, &market_of(market), &pl));
    match r {
        Ok(c) => JsCalculateResult {
            ok: Some(c.into()),
            error: None,
        },
        Err(e) => JsCalculateResult {
            ok: None,
            error: Some(e.code().to_owned()),
        },
    }
}

#[wasm_bindgen(js_name = TaxYear)]
#[derive(Clone, Copy)]
pub struct JsTaxYear {
    pub year: i32,
    pub coupons: f64,
    #[wasm_bindgen(js_name = accruedPaid)]
    pub accrued_paid: f64,
    #[wasm_bindgen(js_name = accruedReceived)]
    pub accrued_received: f64,
    pub redemptions: f64,
    pub sale: f64,
    pub cost: f64,
    pub reinvest: f64,
    pub income: f64,
    pub result: f64,
    pub relieved: f64,
    #[wasm_bindgen(js_name = relievedProceeds)]
    pub relieved_proceeds: f64,
    #[wasm_bindgen(js_name = relievedYears)]
    pub relieved_years: f64,
    pub exempt: f64,
    pub base: f64,
    #[wasm_bindgen(js_name = taxedLow)]
    pub taxed_low: f64,
    #[wasm_bindgen(js_name = taxedHigh)]
    pub taxed_high: f64,
    pub tax: f64,
}

impl From<&TaxYear> for JsTaxYear {
    fn from(t: &TaxYear) -> JsTaxYear {
        JsTaxYear {
            // A calendar year fits an i32; JavaScript gets a number, not a
            // BigInt.
            year: t.year as i32,
            coupons: t.coupons,
            accrued_paid: t.accrued_paid,
            accrued_received: t.accrued_received,
            redemptions: t.redemptions,
            sale: t.sale,
            cost: t.cost,
            reinvest: t.reinvest,
            income: t.income,
            result: t.result,
            relieved: t.relieved,
            relieved_proceeds: t.relieved_proceeds,
            relieved_years: t.relieved_years,
            exempt: t.exempt,
            base: t.base,
            taxed_low: t.taxed_low,
            taxed_high: t.taxed_high,
            tax: t.tax,
        }
    }
}

#[wasm_bindgen(js_name = PriceTrace)]
#[derive(Clone, Copy)]
pub struct JsPriceTrace {
    pub nominal: f64,
    #[wasm_bindgen(js_name = cleanPct)]
    pub clean_pct: f64,
    pub clean: f64,
    #[wasm_bindgen(js_name = couponRatePct)]
    pub coupon_rate_pct: f64,
    #[wasm_bindgen(js_name = periodDays)]
    pub period_days: f64,
    #[wasm_bindgen(js_name = couponAmount)]
    pub coupon_amount: f64,
    #[wasm_bindgen(js_name = daysSinceLast)]
    pub days_since_last: f64,
    #[wasm_bindgen(js_name = accruedComputed)]
    pub accrued_computed: f64,
    #[wasm_bindgen(js_name = accruedQuoted)]
    pub accrued_quoted: Option<f64>,
    pub accrued: f64,
    pub dirty: f64,
}

impl From<&PriceTrace> for JsPriceTrace {
    fn from(p: &PriceTrace) -> JsPriceTrace {
        JsPriceTrace {
            nominal: p.nominal,
            clean_pct: p.clean_pct,
            clean: p.clean,
            coupon_rate_pct: p.coupon_rate_pct,
            period_days: p.period_days,
            coupon_amount: p.coupon_amount,
            days_since_last: p.days_since_last,
            accrued_computed: p.accrued_computed,
            accrued_quoted: p.accrued_quoted,
            accrued: p.accrued,
            dirty: p.dirty,
        }
    }
}

#[wasm_bindgen(js_name = FlowTrace)]
#[derive(Clone, Copy)]
pub struct JsFlowTrace {
    pub day: f64,
    pub years: f64,
    pub coupon: f64,
    pub principal: f64,
    pub amount: f64,
    pub factor: f64,
    #[wasm_bindgen(js_name = presentValue)]
    pub present_value: f64,
}

impl From<&FlowTrace> for JsFlowTrace {
    fn from(f: &FlowTrace) -> JsFlowTrace {
        JsFlowTrace {
            day: f.day,
            years: f.years,
            coupon: f.coupon,
            principal: f.principal,
            amount: f.amount,
            factor: f.factor,
            present_value: f.present_value,
        }
    }
}

#[wasm_bindgen(js_name = GSpread)]
#[derive(Clone, Copy)]
pub struct JsGSpread {
    #[wasm_bindgen(js_name = durationYears)]
    pub duration_years: f64,
    #[wasm_bindgen(js_name = yieldPct)]
    pub yield_pct: f64,
    #[wasm_bindgen(js_name = termBelowYears)]
    pub term_below_years: f64,
    #[wasm_bindgen(js_name = yieldBelowPct)]
    pub yield_below_pct: f64,
    #[wasm_bindgen(js_name = termAboveYears)]
    pub term_above_years: f64,
    #[wasm_bindgen(js_name = yieldAbovePct)]
    pub yield_above_pct: f64,
    #[wasm_bindgen(js_name = curvePct)]
    pub curve_pct: f64,
    #[wasm_bindgen(js_name = spreadBp)]
    pub spread_bp: f64,
}

impl From<&GSpread> for JsGSpread {
    fn from(g: &GSpread) -> JsGSpread {
        JsGSpread {
            duration_years: g.duration_years,
            yield_pct: g.yield_pct,
            term_below_years: g.term_below_years,
            yield_below_pct: g.yield_below_pct,
            term_above_years: g.term_above_years,
            yield_above_pct: g.yield_above_pct,
            curve_pct: g.curve_pct,
            spread_bp: g.spread_bp,
        }
    }
}

#[wasm_bindgen(js_name = GSpreads)]
#[derive(Clone, Copy)]
pub struct JsGSpreads {
    #[wasm_bindgen(js_name = toMaturity)]
    pub to_maturity: JsGSpread,
    #[wasm_bindgen(js_name = toOffer)]
    pub to_offer: Option<JsGSpread>,
}

#[wasm_bindgen(js_name = GSpreadResult, getter_with_clone)]
pub struct JsGSpreadResult {
    pub ok: Option<JsGSpreads>,
    pub error: Option<String>,
}

/// The G-spreads of an issue's yields to maturity and to the offer
/// against a zero-coupon curve.
#[wasm_bindgen]
pub fn g_spread(issue: &JsIssue, market: &JsMarket, curve: Option<JsCurve>) -> JsGSpreadResult {
    let r = issue_of(issue).and_then(|i| crate::g_spread(&i, &market_of(market), &curve_of(curve)));
    match r {
        Ok(GSpreads {
            to_maturity,
            to_offer,
        }) => JsGSpreadResult {
            ok: Some(JsGSpreads {
                to_maturity: (&to_maturity).into(),
                to_offer: to_offer.as_ref().map(Into::into),
            }),
            error: None,
        },
        Err(e) => JsGSpreadResult {
            ok: None,
            error: Some(e.code().to_owned()),
        },
    }
}

#[wasm_bindgen(js_name = YieldTrace, getter_with_clone)]
#[derive(Clone)]
pub struct JsYieldTrace {
    #[wasm_bindgen(js_name = eventDay)]
    pub event_day: f64,
    pub flows: Vec<JsFlowTrace>,
    pub ytm: f64,
    #[wasm_bindgen(js_name = presentValue)]
    pub present_value: f64,
    #[wasm_bindgen(js_name = priceWithFee)]
    pub price_with_fee: f64,
    #[wasm_bindgen(js_name = ytmAfterFee)]
    pub ytm_after_fee: f64,
    #[wasm_bindgen(js_name = gSpread)]
    pub g_spread: JsGSpread,
    pub held: JsBreakdown,
    pub tax: Vec<JsTaxYear>,
}

impl From<&YieldTrace> for JsYieldTrace {
    fn from(y: &YieldTrace) -> JsYieldTrace {
        JsYieldTrace {
            event_day: y.event_day,
            flows: y.flows.iter().map(Into::into).collect(),
            ytm: y.ytm,
            present_value: y.present_value,
            price_with_fee: y.price_with_fee,
            ytm_after_fee: y.ytm_after_fee,
            g_spread: (&y.g_spread).into(),
            held: y.held.into(),
            tax: y.tax.iter().map(Into::into).collect(),
        }
    }
}

#[wasm_bindgen(js_name = Explanation, getter_with_clone)]
#[derive(Clone)]
pub struct JsExplanation {
    #[wasm_bindgen(js_name = feePct)]
    pub fee_pct: f64,
    pub price: JsPriceTrace,
    #[wasm_bindgen(js_name = toMaturity)]
    pub to_maturity: JsYieldTrace,
    #[wasm_bindgen(js_name = toOffer)]
    pub to_offer: Option<JsYieldTrace>,
    pub plan: JsBreakdown,
    #[wasm_bindgen(js_name = planTax)]
    pub plan_tax: Vec<JsTaxYear>,
}

impl From<Explanation> for JsExplanation {
    fn from(e: Explanation) -> JsExplanation {
        JsExplanation {
            fee_pct: e.fee_pct,
            price: (&e.price).into(),
            to_maturity: (&e.to_maturity).into(),
            to_offer: e.to_offer.as_ref().map(Into::into),
            plan: e.plan.into(),
            plan_tax: e.plan_tax.iter().map(Into::into).collect(),
        }
    }
}

#[wasm_bindgen(js_name = ExplainResult, getter_with_clone)]
pub struct JsExplainResult {
    pub ok: Option<JsExplanation>,
    pub error: Option<String>,
}

/// Works out an issue's figures for a plan, a broker's fee in percent and
/// the zero-coupon curve the G-spreads are taken against.
#[wasm_bindgen]
pub fn explain(
    issue: &JsIssue,
    market: &JsMarket,
    plan: &JsPlan,
    fee_pct: f64,
    curve: Option<JsCurve>,
) -> JsExplainResult {
    let r = issue_of(issue)
        .and_then(|i| Ok((i, plan_of(plan)?)))
        .and_then(|(i, pl)| crate::explain(&i, &market_of(market), &pl, fee_pct, &curve_of(curve)));
    match r {
        Ok(e) => JsExplainResult {
            ok: Some(e.into()),
            error: None,
        },
        Err(e) => JsExplainResult {
            ok: None,
            error: Some(e.code().to_owned()),
        },
    }
}
