//! Worked examples: small issues whose results are computed by hand, with
//! the arithmetic in the comments. The same examples run against the
//! TypeScript twin in `packages/yield-twin/test/worked.test.ts`.

use tyche_yield::*;

fn close(got: f64, want: f64) -> bool {
    (got - want).abs() <= 1e-9 * want.abs().max(1.0)
}

macro_rules! assert_close {
    ($got:expr, $want:expr) => {{
        let (g, w) = ($got, $want);
        assert!(close(g, w), "{} = {g}, want {w}", stringify!($got));
    }};
}

fn market(valuation_date: &str) -> Market {
    Market {
        valuation_date: valuation_date.into(),
        key_rate_pct: 16.0,
    }
}

// A two-year floater at key rate plus 2, annual coupons, bought at par on
// a coupon day: valuation 2026-01-01, coupons on day 365 (2027-01-01) and
// day 730 (2028-01-01), no accrued interest. Its flows are 180 and 1,180
// per bond, so its yield is 18 percent (1,180 / 1.18 = 1,000).
fn floater() -> Issue {
    Issue {
        nominal: 1000.0,
        price_pct: 100.0,
        accrued: None,
        coupon_type: CouponType::Floater,
        coupon_rate_pct: 0.0,
        spread_pct: 2.0,
        period_days: 365.0,
        maturity: "2028-01-01".into(),
        offers: vec![],
        amortization: vec![],
    }
}

// Ten bonds held for a year, no tax, no reinvestment.
fn floater_plan(rate_shift_pct: f64) -> Plan {
    Plan {
        amount: 10_000.0,
        horizon_day: 365.0,
        reinvest: false,
        tax_regime: TaxRegime::IisB,
        other_income: 0.0,
        rate_shift_pct,
    }
}

#[test]
fn floater_sale_follows_the_key_rate_not_duration() {
    let c = calculate(&floater(), &market("2026-01-01"), &floater_plan(2.0)).unwrap();
    // The plan: coupon 180 x 10 = 1,800; the day-730 flow sold on day 365
    // at 18 percent: 1,180 / 1.18 = 1,000 x 10 = 10,000; commission 0.05
    // percent of 10,000 bought and 10,000 sold = 10.
    // Total 1,800 + 10,000 - 10 = 11,790.
    assert_close!(c.plan.total, 11_790.0);
    // Key rate +2 by the horizon: it moves in equal steps on each coupon up
    // to the first one after the horizon, 16 + 1 = 17 and then 18 percent,
    // so the coupons are 17 + 2 = 19 percent (190) and 18 + 2 = 20 percent
    // (200). The spread to the key rate stays: the day-730 flow is
    // discounted at 18 + 2 = 20 percent, 1,200 / 1.2 = 1,000. Coupons
    // 1,900, sale 10,000, commission 10: total 11,890, 100 more than the
    // plan. A fixed bond's duration (1 / 1.18 = 0.847) would have taken
    // 1.7 percent off the price instead.
    let e = c.early_exit;
    assert_close!(e.result.coupons, 1_900.0);
    assert_close!(e.result.body, 10_000.0);
    assert_close!(e.result.total, 11_890.0);
    assert_close!(e.diff, 100.0);
}

#[test]
fn floater_scenarios_keep_the_price_at_par() {
    let c = calculate(&floater(), &market("2026-01-01"), &floater_plan(0.0)).unwrap();
    let s = c.floater.unwrap().scenarios;
    // Key rate -2 over four coupons: 16 - 0.5 = 15.5, then 15 percent; the
    // coupons pay 17.5 and 17 percent (175 and 170). The day-730 flow, 1,170,
    // is discounted at 18 - 1 = 17 percent: 1,000. Total 1,750 + 10,000 - 10.
    assert_close!(s[0].breakdown.body, 10_000.0);
    assert_close!(s[0].breakdown.total, 11_740.0);
    // Unchanged: 1,800 + 10,000 - 10.
    assert_close!(s[1].breakdown.total, 11_790.0);
    // Key rate +2: 16.5 then 17 percent, coupons 185 and 190; 1,190 / 1.19
    // = 1,000. Total 1,850 + 10,000 - 10.
    assert_close!(s[2].breakdown.body, 10_000.0);
    assert_close!(s[2].breakdown.total, 11_840.0);
}

// Two years, 10 percent annual coupons, half the nominal repaid with the
// first coupon: valuation 2026-01-01, coupons on day 365 (2027-01-01) and
// day 730 (2028-01-01), bought at par with no accrued interest. Per bond
// the flows are 100 + 500 = 600 and then 10 percent of the 500 left, 50 +
// 500 = 550, so the yield is 10 percent: 600 / 1.1 + 550 / 1.21 = 1,000.
fn amortising() -> Issue {
    Issue {
        nominal: 1000.0,
        price_pct: 100.0,
        accrued: None,
        coupon_type: CouponType::Fixed,
        coupon_rate_pct: 10.0,
        spread_pct: 0.0,
        period_days: 365.0,
        maturity: "2028-01-01".into(),
        offers: vec![],
        amortization: vec![Amortization {
            date: "2027-01-01".into(),
            fraction_pct: 50.0,
        }],
    }
}

#[test]
fn hold_value_reinvests_returned_principal() {
    // Coupon 100 and principal 500 on day 365, reinvested at 10 percent for
    // the year to day 730: 600 x 0.1 = 60.
    let hv = hold_value(
        &[365.0, 730.0],
        &[100.0, 50.0],
        &[500.0, 500.0],
        730.0,
        0.1,
        0.1,
    );
    assert_close!(hv[0], 150.0);
    assert_close!(hv[1], 60.0);
    assert_close!(hv[2], 500.0);
    assert_close!(hv[3], 500.0);
    assert_close!(hv[4], 0.0);
}

#[test]
fn amortising_plan_earns_about_its_yield() {
    let plan = Plan {
        amount: 10_000.0,
        horizon_day: 730.0,
        reinvest: true,
        tax_regime: TaxRegime::IisB,
        other_income: 0.0,
        rate_shift_pct: 0.0,
    };
    let b = calculate(&amortising(), &market("2026-01-01"), &plan)
        .unwrap()
        .plan;
    // Ten bonds for 10,000. Coupons 1,000 + 500; the 5,000 repaid on day
    // 365 and the 1,000 coupon both earn 10 percent for a year: 600.
    // Final redemption 5,000; commission 0.05 percent of 10,000 = 5.
    // Total 1,500 + 600 + 5,000 + 5,000 - 5 = 12,095, and the effective
    // annual return is sqrt(1.2095) - 1 = 9.977 percent: the yield, less the
    // commission. With the repaid principal left idle it was
    // sqrt(1.1595) - 1 = 7.68 percent.
    assert_close!(b.coupons, 1_500.0);
    assert_close!(b.reinvest, 600.0);
    assert_close!(b.amort, 5_000.0);
    assert_close!(b.body, 5_000.0);
    assert_close!(b.total, 12_095.0);
    assert_close!(b.annual_pct.unwrap(), 9.977_270_378_928_749);
}

#[test]
fn no_annual_return_under_a_month() {
    // The par floater above for 29 and for 30 days. Under 30 days the
    // return is given over the period only; compounded to a year, the
    // 0.1 percent of commission alone would read as about -1.2 percent a
    // year at 30 days and -30 percent at one day.
    let at = |horizon_day: f64| {
        let plan = Plan {
            horizon_day,
            ..floater_plan(0.0)
        };
        calculate(&floater(), &market("2026-01-01"), &plan)
            .unwrap()
            .plan
    };
    let short = at(29.0);
    assert_eq!(short.annual_pct, None);
    assert_close!(
        short.period_pct,
        (short.total / short.invested - 1.0) * 100.0
    );
    let month = at(30.0);
    assert_eq!(
        month.annual_pct,
        Some(effective_annual_pct(month.invested, month.total, 30.0))
    );
    assert_eq!(MIN_ANNUALISED_DAYS, 30.0);
}

// Ten bonds to maturity, without reinvestment, in an ordinary account.
fn above_par_plan(other_income: f64) -> Plan {
    Plan {
        amount: 11_100.0,
        horizon_day: 547.0,
        reinvest: false,
        tax_regime: TaxRegime::Standard,
        other_income,
        rate_shift_pct: 0.0,
    }
}

// Annual 10 percent coupons, bought above par between coupons: valuation
// 2026-01-01, maturity 2027-07-02 (day 547), so the coupons fall on day 182
// (2026-07-02) and day 547 (2027-07-02). 183 days of the 365-day period
// have passed: accrued interest 100 x 183 / 365 = 50.136986. Clean price
// 1,050, dirty 1,100.136986.
fn above_par() -> Issue {
    Issue {
        nominal: 1000.0,
        price_pct: 105.0,
        accrued: None,
        coupon_type: CouponType::Fixed,
        coupon_rate_pct: 10.0,
        spread_pct: 0.0,
        period_days: 365.0,
        maturity: "2027-07-02".into(),
        offers: vec![],
        amortization: vec![],
    }
}

#[test]
fn tax_nets_accrued_interest_and_the_loss_against_coupons() {
    let plan = above_par_plan(0.0);
    let b = calculate(&above_par(), &market("2026-01-01"), &plan)
        .unwrap()
        .plan;
    // Ten bonds: invested 11,001.369863, of which accrued interest
    // 501.369863; commission on the purchase 0.05 percent, 5.500685.
    // 2026: the first coupon, 1,000, less the accrued interest paid for it,
    // 501.369863: 498.630137 taxable.
    // 2027: the second coupon, 1,000, and the redemption: 10,000 received
    // against a cost of 11,001.369863 - 501.369863 (already deducted from
    // the coupon) + 5.500685 commission = 10,505.500685, a loss of
    // 505.500685, so 1,000 - 505.500685 = 494.499315 taxable.
    // Tax 13 percent of 498.630137 + 494.499315 = 129.106829 (it was 13
    // percent of both coupons, 260). Total 2,000 + 10,000 - 129.106829 -
    // 5.500685 = 11,865.392486.
    assert_close!(b.invested, 11_001.369_863_013_699);
    assert_close!(b.tax, -129.106_828_767_123_3);
    assert_close!(b.total, 11_865.392_486_301_369);
}

#[test]
fn income_tax_is_15_percent_above_2_4_million_a_year() {
    // 13 percent up to 2,400,000 of the year's investment income, 15 above.
    assert_close!(income_tax(1_000.0, 0.0), 130.0);
    // With 2,000,000 of other income, 400,000 of a 1,000,000 base is under
    // the threshold: 52,000 + 15 percent of 600,000 = 90,000; 142,000.
    assert_close!(income_tax(1_000_000.0, 2_000_000.0), 142_000.0);
    assert_close!(income_tax(1_000.0, 3_000_000.0), 150.0);
    assert_close!(income_tax(-500.0, 0.0), 0.0);
    assert_eq!(TAX_THRESHOLD, 2_400_000.0);
}

#[test]
fn the_threshold_applies_to_each_year() {
    // The taxable bases of the above-par plan are 498.630137 in 2026 and
    // 494.499315 in 2027. With 2,399,700 of other income each year, 300 of
    // each year's base is taxed at 13 percent and the rest at 15:
    // 39 + 0.15 x 198.630137 = 68.794521 and 39 + 0.15 x 194.499315 =
    // 68.174897, together 136.969418.
    let at = |other_income: f64| {
        calculate(
            &above_par(),
            &market("2026-01-01"),
            &above_par_plan(other_income),
        )
        .unwrap()
        .plan
        .tax
    };
    assert_close!(at(2_399_700.0), -136.969_417_808_219_2);
    // All of it at 15 percent: 0.15 x 993.129452 = 148.969418.
    assert_close!(at(3_000_000.0), -148.969_417_808_219_16);
}

// A zero-coupon issue bought at `price_pct` on 2026-09-04 and held to its
// maturity: no coupons, so the redemption result is the whole tax base.
fn zero_coupon(price_pct: f64, maturity: &str) -> (Issue, Plan, Market) {
    let issue = Issue {
        nominal: 1000.0,
        price_pct,
        accrued: None,
        coupon_type: CouponType::Fixed,
        coupon_rate_pct: 0.0,
        spread_pct: 0.0,
        period_days: 1097.0,
        maturity: maturity.into(),
        offers: vec![],
        amortization: vec![],
    };
    let m = market("2026-09-04");
    let day = date::day_offset(&m.valuation_date, maturity).unwrap() as f64;
    let plan = Plan {
        amount: 9_000.0,
        horizon_day: day,
        reinvest: false,
        tax_regime: TaxRegime::Standard,
        other_income: 0.0,
        rate_shift_pct: 0.0,
    };
    (issue, plan, m)
}

#[test]
fn long_term_relief_starts_the_day_after_the_third_anniversary() {
    // Bought on 2026-09-04: three years end on 2029-09-04 (day 1,096, as
    // 2028 has 29 February), and the relief needs more than three years.
    // Ten bonds at 900: cost 9,000 + 4.5 commission, redemption 10,000, a
    // gain of 995.5.
    let (issue, plan, m) = zero_coupon(90.0, "2029-09-04");
    assert_eq!(plan.horizon_day, 1096.0);
    let b = calculate(&issue, &m, &plan).unwrap().plan;
    // Redeemed on the anniversary: 13 percent of 995.5 = 129.415.
    assert_close!(b.tax, -129.415);
    let (issue, plan, m) = zero_coupon(90.0, "2029-09-05");
    let b = calculate(&issue, &m, &plan).unwrap().plan;
    // A day later the gain is exempt.
    assert_close!(b.tax, 0.0);
}

#[test]
fn long_term_relief_is_capped_at_3_million_a_year_held() {
    // 1,000,000,000 at 500 a bond buys 2,000,000 bonds; commission 500,000;
    // the redemption returns 2,000,000,000, a gain of 999,500,000. Held
    // three full years, at most 3 x 3,000,000 = 9,000,000 is exempt;
    // 990,500,000 is taxed: 13 percent of 2,400,000 = 312,000 and 15 of
    // the remaining 988,100,000 = 148,215,000, 148,527,000 in all.
    let (issue, plan, m) = zero_coupon(50.0, "2029-09-05");
    let plan = Plan {
        amount: 1e9,
        ..plan
    };
    let b = calculate(&issue, &m, &plan).unwrap().plan;
    assert_close!(b.qty, 2_000_000.0);
    assert_close!(b.tax, -148_527_000.0);
    assert_close!(b.total, 1_850_973_000.0);
}

#[test]
fn long_term_relief_leaves_coupons_taxed() {
    // 10 percent annual coupons from 2026-01-01 to 2029-12-31 (day 1,460),
    // coupons on days 365, 730, 1,095 and 1,460: 2027-01-01, 2028-01-01,
    // 2028-12-31 and 2029-12-31. Ten bonds at 900.
    let issue = Issue {
        nominal: 1000.0,
        price_pct: 90.0,
        accrued: None,
        coupon_type: CouponType::Fixed,
        coupon_rate_pct: 10.0,
        spread_pct: 0.0,
        period_days: 365.0,
        maturity: "2029-12-31".into(),
        offers: vec![],
        amortization: vec![],
    };
    let plan = Plan {
        amount: 9_000.0,
        horizon_day: 1460.0,
        reinvest: false,
        tax_regime: TaxRegime::Standard,
        other_income: 0.0,
        rate_shift_pct: 0.0,
    };
    let b = calculate(&issue, &market("2026-01-01"), &plan)
        .unwrap()
        .plan;
    // Every coupon, the last one too, is taxed: 4 x 1,000 x 13 percent =
    // 520. The redemption gain, 10,000 - 9,004.5 = 995.5, is exempt. Total
    // 4,000 + 10,000 - 520 - 4.5 = 13,475.5.
    assert_close!(b.tax, -520.0);
    assert_close!(b.total, 13_475.5);
}

// A one-year bullet, 10 percent annual coupon, bought at par on the
// valuation date, 2026-01-01; maturity 2027-01-01 (day 365). The only
// coupon day is maturity, so no time has passed since the last coupon and
// the accrued interest is 0: the dirty price is the clean price, 1,000.
// The one flow is 100 + 1,000 = 1,100.
fn bullet() -> Issue {
    Issue {
        nominal: 1000.0,
        price_pct: 100.0,
        accrued: None,
        coupon_type: CouponType::Fixed,
        coupon_rate_pct: 10.0,
        spread_pct: 0.0,
        period_days: 365.0,
        maturity: "2027-01-01".into(),
        offers: vec![],
        amortization: vec![],
    }
}

// Ten bonds (10,100 buys floor(10,100 / 1,000) = 10), held a year in a
// brokerage account.
fn bullet_plan(other_income: f64) -> Plan {
    Plan {
        amount: 10_100.0,
        horizon_day: 365.0,
        reinvest: false,
        tax_regime: TaxRegime::Standard,
        other_income,
        rate_shift_pct: 0.0,
    }
}

#[test]
fn explain_works_out_the_yield_and_the_fee() {
    let e = explain(&bullet(), &market("2026-01-01"), &bullet_plan(0.0), 1.0).unwrap();
    assert_close!(e.price.clean, 1000.0);
    assert_close!(e.price.accrued, 0.0);
    assert_close!(e.price.dirty, 1000.0);
    let m = &e.to_maturity;
    assert_eq!(m.flows.len(), 1);
    // 1,100 a year away at the solved yield, 10 percent: 1,100 / 1.1 =
    // 1,000, the price back.
    assert_close!(m.flows[0].amount, 1100.0);
    assert_close!(m.flows[0].years, 1.0);
    assert!((m.ytm - 0.1).abs() < 1e-9);
    assert!((m.flows[0].factor - 1.0 / 1.1).abs() < 1e-9);
    assert!((m.present_value - 1000.0).abs() < 1e-6);
    // A fee of 1 percent: 1,010 paid for the same 1,100, so 1,100 / 1,010
    // - 1 = 9 / 101 = 8.9109 percent.
    assert_close!(m.price_with_fee, 1010.0);
    assert!((m.ytm_after_fee - 9.0 / 101.0).abs() < 1e-9);
}

#[test]
fn explain_traces_the_tax_and_the_yield_after_it() {
    let e = explain(&bullet(), &market("2026-01-01"), &bullet_plan(0.0), 1.0).unwrap();
    let held = &e.to_maturity.held;
    // Ten bonds, 10,000 paid, a fee of 1 percent: 100.
    assert_close!(held.invested, 10_000.0);
    assert_close!(held.commission, -100.0);
    // One tax year, 2027 (maturity falls on 2027-01-01): coupons 1,000;
    // redemption 10,000 against a cost of 10,000 + 100 = 10,100, a loss of
    // 100 netted against the coupons; base 900, all of it at 13 percent:
    // 117.
    assert_eq!(e.to_maturity.tax.len(), 1);
    let t = e.to_maturity.tax[0];
    assert_eq!(t.year, 2027);
    assert_close!(t.coupons, 1000.0);
    assert_close!(t.accrued_paid, 0.0);
    assert_close!(t.redemptions, 10_000.0);
    assert_close!(t.cost, 10_100.0);
    assert_close!(t.result, -100.0);
    assert_close!(t.base, 900.0);
    assert_close!(t.taxed_low, 900.0);
    assert_close!(t.taxed_high, 0.0);
    assert_close!(t.tax, 117.0);
    // Total 1,000 + 10,000 - 117 - 100 = 10,783, nothing reinvested: over
    // exactly a year that is 7.83 percent, the yield after tax and the fee.
    assert_close!(held.total, 10_783.0);
    assert_close!(held.annual_pct.unwrap(), 7.83);
    // With 2,399,900 of other income only 100 of the base fits under the
    // 2.4 million threshold: 100 at 13 percent and 800 at 15, 13 + 120 =
    // 133.
    let e = explain(
        &bullet(),
        &market("2026-01-01"),
        &bullet_plan(2_399_900.0),
        1.0,
    )
    .unwrap();
    let t = e.to_maturity.tax[0];
    assert_close!(t.taxed_low, 100.0);
    assert_close!(t.taxed_high, 800.0);
    assert_close!(t.tax, 133.0);
}

// 7.3 percent paid every 180 days: 1,000 x 7.3% x 180 / 365 = 36 a
// coupon. Valuation 2026-01-01, maturity on day 450 (2027-03-27), so the
// coupons fall on days 90, 270 and 450, and 180 - 90 = 90 days have passed
// since the last one: accrued interest 36 x 90 / 180 = 18, dirty price
// 1,000 + 18 = 1,018.
fn mid_period() -> Issue {
    Issue {
        nominal: 1000.0,
        price_pct: 100.0,
        accrued: None,
        coupon_type: CouponType::Fixed,
        coupon_rate_pct: 7.3,
        spread_pct: 0.0,
        period_days: 180.0,
        maturity: "2027-03-27".into(),
        offers: vec![],
        amortization: vec![],
    }
}

#[test]
fn explain_shows_accrued_interest_paid_and_received() {
    // Ten bonds (10,180 / 1,018), sold on day 180, halfway between the
    // coupons of days 90 and 270.
    let plan = Plan {
        amount: 10_180.0,
        horizon_day: 180.0,
        reinvest: false,
        tax_regime: TaxRegime::Standard,
        other_income: 0.0,
        rate_shift_pct: 0.0,
    };
    let e = explain(&mid_period(), &market("2026-01-01"), &plan, COMMISSION_PCT).unwrap();
    assert_close!(e.price.coupon_amount, 36.0);
    assert_close!(e.price.days_since_last, 90.0);
    assert_close!(e.price.accrued, 18.0);
    assert_close!(e.price.dirty, 1018.0);
    // Everything happens in 2026: the coupon of day 90 (360 for ten
    // bonds) less the 180 of accrued interest paid at purchase, and the
    // sale, whose proceeds hold the 36 x 90 / 180 = 18 a bond accrued since
    // day 90: 180.
    assert_eq!(e.plan_tax.len(), 1);
    let t = e.plan_tax[0];
    assert_eq!(t.year, 2026);
    assert_close!(t.coupons, 360.0);
    assert_close!(t.accrued_paid, 180.0);
    assert_close!(t.income, 180.0);
    assert_close!(t.accrued_received, 180.0);
    // The cost: 10,180 paid, plus 0.05 percent of it, less the 180
    // deducted: 10,005.09, and the sale's own 0.05 percent.
    assert_close!(t.cost, 10_005.09 + t.sale * 0.0005);
    assert_close!(t.result, t.sale - t.cost);
    // The sale is the two flows left, discounted to day 180 at the yield.
    let y = e.to_maturity.ytm;
    let per_bond = 36.0 * (1.0 + y).powf(-90.0 / 365.0) + 1036.0 * (1.0 + y).powf(-270.0 / 365.0);
    assert_close!(t.sale, 10.0 * per_bond);
    // The same plan through calculate pays the same tax.
    let c = calculate(&mid_period(), &market("2026-01-01"), &plan).unwrap();
    assert_close!(c.plan.tax, -t.tax);
}

#[test]
fn explain_refuses_a_fee_it_cannot_use() {
    let m = market("2026-01-01");
    for fee in [-0.01, f64::NAN, f64::INFINITY] {
        assert_eq!(
            explain(&bullet(), &m, &bullet_plan(0.0), fee),
            Err(Error::InvalidFee)
        );
    }
    // The plan's errors come first.
    let plan = Plan {
        amount: 0.0,
        ..bullet_plan(0.0)
    };
    assert_eq!(
        explain(&bullet(), &m, &plan, -1.0),
        Err(Error::AmountNotPositive)
    );
}
