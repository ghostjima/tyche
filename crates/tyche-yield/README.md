# tyche-yield

Part of [Tyche Bonds](../../README.md). CI builds, tests and measures
this crate with the rest of the repository; the badges and what each one
counts are in the root README.

Bond mathematics for a bond-investing demo, in Rust compiled to
WebAssembly, with a TypeScript twin in
[`packages/yield-twin`](../../packages/yield-twin): a second implementation
of the same functions, written separately and checked against the Rust
one on every case.

Status: early. Both implementations pass the 180 cases in `cases.json`
and the hand-computed worked examples,
and the WebAssembly build agrees with the twin on those cases and on
1,000 generated issues within 1e-6 relative. Sizes, timings and how the
WebAssembly boundary was chosen: [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md).

## What it computes

Primitives, on flat arrays of numbers:

- price from an annual effective yield; yield to maturity, effective
  (bisection on -99 to 1000 percent, 200 steps), and the simple yield
  over the full term (all payments less the price, over the price,
  divided by the years to the last payment; not compounded, and well
  below the yield for an amortising issue, whose principal comes back
  early);
- accrued interest; Macaulay and modified duration;
- the cash-flow schedule with amortisation and an offer (redeemed at the
  offer, or a new coupon rate after it);
- floater key-rate paths and coupons; a yield as the rate compounded
  once a coupon period, and the value of flows discounted along a path
  of per-period rates;
- personal income tax on a year's base: 13 percent up to 2.4 million
  roubles of the year's investment income, 15 percent above, the
  threshold shared with the holder's other investment income;
- what a holder collects by a horizon (coupons, income from reinvesting
  the coupons and the principal repaid early, amortisation, final
  redemption, sale value), and the price after a parallel rate shift;
- the zero-coupon yield at a term from a curve published at fixed terms
  (`curve_yield_pct`: linear between the terms, flat beyond them).

For an issue:

- `derive_bond(issue, market)`: the coupon schedule counted back from
  maturity, the flows to maturity and to the nearest offer, accrued
  interest, the dirty price, yields to maturity and to the offer, the
  simple yield, and durations.
- `calculate(issue, market, plan, fee_pct)`: for an amount, a horizon,
  reinvestment on or off, the account (ordinary or IIS type B), the
  holder's other investment income, a key-rate change by the horizon and
  a broker's fee in percent of each trade:
  the plan's totals, its return over the period and, for a horizon of 30
  days or more, its effective annual return, as a signed breakdown; the
  early exit under the key-rate change; three floater scenarios (key rate
  -2, 0 and +2 points, reached over four coupon periods); and, for an
  issue with an offer, holding to the offer against holding through it
  at a 0.1 percent coupon.
- `order_ticket(issue, market, order)`: an order ticket's figures, for
  a buy or a sell of a number of lots of a given size: at a limit clean
  price in percent of the nominal, the yields to maturity, to the offer
  and to the nearest event at the dirty price (the clean price plus the
  accrued interest the buyer pays, the issue's quoted one or the one
  computed from the schedule); at a limit yield to the nearest event, the
  clean price that gives it, put on the price step (down for a buy, up
  for a sell, so the one who sets the limit never gets a worse yield);
  the clean, accrued and total amounts, the broker's fee in percent of
  the amount, what the buyer pays or the seller receives, and the yield
  to the nearest event at one bond's price with its share of the fee
  added for a buy or taken off for a sell. A limit price must be on the
  price step; a step of 0 is none.
- `g_spread(issue, market, curve)`: the G-spread of the yield to
  maturity and of the yield to the offer to a zero-coupon yield curve,
  each at the Macaulay duration of its own flows: the duration, the
  yield, the two published terms the duration falls between and their
  yields, the curve's yield there, and the spread in basis points.
- `explain(issue, market, plan, fee_pct, curve)`: the working behind those
  figures, for a screen that shows it. The dirty price as the clean
  price and the accrued interest (the coupon, the days since the last
  one, the period); for maturity and for the offer, each flow with its
  time in years, its discount factor and its present value at the solved
  yield, which add up to the dirty price again; the yield at the dirty
  price plus a broker's fee in percent; the G-spread of each yield, as
  `g_spread` gives it; holding the plan's amount to
  each event with nothing reinvested, after the fee and the tax, whose
  effective annual return is the yield after tax and the fee without
  reinvestment; and the tax year by year, for each event and for the
  plan itself: coupons, accrued interest paid at purchase and received
  in a sale, redemptions and the sale, the cost written off, the result
  (a loss is netted against the year's coupons), the long-term holding
  relief, the base, the parts of it taxed at 13 and at 15 percent with
  the holder's other income, and the tax. The plan is `calculate`'s with
  the same fee, and the years' tax adds up to its tax.

How `calculate` models the holding:

- Coupons and principal repaid before the horizon are reinvested, when
  the plan asks, at the yield to maturity.
- A key-rate change moves a fixed coupon's sale price by its modified
  duration. A floater's coupons follow the key rate, and its sale keeps
  today's spread to the key rate (the flows are discounted along the
  key-rate path at that spread), so its price stays close to where it
  is; the early exit gives no duration for a floater.
- Tax, in an ordinary account, is counted per calendar year: coupons and
  the result of redemptions and the sale form one base, so a loss
  reduces that year's tax on coupons; a negative year pays nothing and
  is not carried to another year. The accrued interest paid at purchase
  reduces the first coupon received and the cost by the same amount, or
  stays in the cost when no coupon is received; commissions are costs.
  A redemption or sale more than three years after the purchase,
  counted by calendar anniversary, has its positive result exempt (the
  long-term holding relief), up to 3 million roubles for each full year
  held; coupons stay taxed. Rates as above. Reinvestment income is taxed
  in the horizon's year.
- IIS type B (only accounts opened by the end of 2023) is taken as no
  tax: income in it is free of tax when it is closed after at least
  three years.
- The return is not annualised for a horizon under 30 days, where
  compounding to a year turns small amounts such as the commission into
  large annual rates.

The tax rules follow the Tax Code of the Russian Federation, part two,
articles 214.1, 219.1 and 224, as in force from 1 October 2026.

The G-spread and the curve:

- The curve is an input: the zero-coupon yield curve of federal loan
  bonds (OFZ) as the Bank of Russia publishes it
  (https://www.cbr.ru/hd_base/zcyc_params/), calculated by the Moscow
  Exchange (https://www.moex.com/a3642): yields in percent a year at
  fixed terms in years, 0.25 to 30 in the app's snapshot.
- Compounding: the Exchange fits a continuously compounded rate G(t), in
  basis points, and publishes Y(t) = exp(G(t) / 10000) - 1, an annual
  effective rate. The engine's yields are annual effective on ACT/365, so
  the spread is the plain difference, `(yield - curve) x 100` basis
  points, with no conversion.
- Interpolation: the publication gives the curve at its terms only, not
  the parameters of the Exchange's fitted curve, so between two terms
  the curve is read linearly in the yield, and before the first term or
  after the last it is held at that term's yield. This is how the
  synthetic market reads the same curve when it prices an issue.
- Duration: the Macaulay duration of the flows to the event (maturity,
  or redemption at the offer) at the yield to that event, in years of
  365 days. A yield that is NaN (a price that is not positive) gives NaN
  figures, not an error.

Conventions: days are whole-day offsets from the valuation date, ACT/365;
amounts are per bond in currency units unless the field is a total; rates
ending in `_pct` (`Pct` in JavaScript) are percents, others are
fractions. In a breakdown, income lines are positive and costs (`tax`,
`commission`) negative, and `total` is their sum. The broker's fee
`calculate` and `explain` take is charged on the purchase and on a sale
before redemption, not at redemption; `COMMISSION_PCT`, 0.05 percent, is
the usual one. Outputs are
numbers, codes and day offsets; there is no human-language text.

Errors are values. `derive_bond`, `calculate`, `explain`, `g_spread` and
`order_ticket` return an error code, in this order of checks (each
function checks only its own inputs; `order_ticket` checks the fee after
the price step):

| code | when |
|---|---|
| `invalid_code` | coupon type, tax regime, order side or limit kind is not a known code (JavaScript only) |
| `invalid_date` | a date is not a valid `YYYY-MM-DD` |
| `invalid_nominal` | nominal is not a positive finite number |
| `invalid_period` | coupon period is not a finite number of at least one day |
| `matured` | maturity is on or before the valuation date |
| `amount_not_positive` | amount is not a positive finite number |
| `amount_too_large` | amount is above 1e9 |
| `horizon_out_of_range` | horizon is not between day 1 and maturity |
| `invalid_other_income` | other investment income is not a finite number of at least zero |
| `invalid_price` | dirty price is not a positive finite number |
| `amount_below_one_bond` | the amount does not buy one bond |
| `invalid_fee` | the broker's fee given to `calculate` or `explain` is not a finite number of at least zero |
| `curve_missing` | no zero-coupon curve: neither terms nor yields (in JavaScript, also `null` or `undefined`) |
| `invalid_curve` | the curve's terms and yields differ in number, a term is not a finite number above zero, the terms do not strictly ascend, or a yield is not a finite number |
| `invalid_quantity` | an order's lots or lot size is not a whole number of at least one |
| `invalid_limit` | an order's limit price is not a positive finite number, or its limit yield is not a finite number above -99 percent or gives no positive clean price |
| `invalid_tick` | an order's price step is not a finite number of at least zero |
| `price_off_tick` | an order's limit price is not on the price step (within a billionth of a step) |

The primitives return NaN for invalid inputs (no flows, a price that is
not positive, a NaN argument), and `derive_bond` keeps that: a price that
is not positive gives NaN yields, not an error. Nothing panics on any
input.

Limits: coupons fall at a fixed period in days, not on calendar months;
amortisation pays only on a coupon day, and amortisation before the
valuation date does not reduce the nominal; the purchase settles on the
valuation date and a sale on the horizon; tax is counted at the horizon
rather than withheld coupon by coupon; carrying a loss to a later year
(by declaration) is not modelled; reinvestment and the sale both use the
yield to maturity, which for a floater assumes the key rate stays where
it is.

## API

Rust:

```rust
use tyche_yield::{
    calculate, derive_bond, CouponType, Issue, Market, Plan, TaxRegime, COMMISSION_PCT,
};

let issue = Issue {
    nominal: 1000.0,
    price_pct: 98.12,
    accrued: None, // None: computed from the schedule
    coupon_type: CouponType::Fixed,
    coupon_rate_pct: 14.0,
    spread_pct: 0.0,
    period_days: 182.0,
    maturity: "2029-01-12".into(),
    offers: vec![],
    amortization: vec![],
};
let market = Market { valuation_date: "2026-09-04".into(), key_rate_pct: 16.0 };
let derived = derive_bond(&issue, &market)?;

let plan = Plan {
    amount: 100_000.0,
    horizon_day: 365.0,
    reinvest: true,
    tax_regime: TaxRegime::Standard,
    other_income: 0.0,
    rate_shift_pct: 2.0,
};
let result = calculate(&issue, &market, &plan, COMMISSION_PCT)?;
```

The primitives (`price_from_yield`, `ytm_effective`, `ytm_simple`,
`accrued_interest`, `macaulay_duration`, `modified_duration`,
`build_cash_flow`, `floater_rate_path`, `floater_coupons`,
`periodic_rate_pct`, `value_along_path`, `income_tax`,
`hold_value`, `price_after_rate_shift`, `curve_yield_pct`) and
`effective_annual_pct` are re-exported at the crate root. Types are plain structs without serde.

JavaScript, from the WebAssembly package: the primitives under the same
names on `Float64Array`s; `derive_bond`, `calculate`, `explain`,
`g_spread` and `order_ticket` (an `Order` with `side` "buy" or "sell"
and `limit` "price" or "yield") on wasm-bindgen structs with camelCase fields. Results have
`ok` or `error` set; arrays come back as `Float64Array`; each struct read
from a result is a copy to `free()` when done. A `Curve` is passed by
value: the call consumes it, so it is made for each call and not used or
freed after it; `undefined` in its place is `curve_missing`.

```js
import init, { Issue, Market, derive_bond } from "./pkg/tyche_yield.js";

await init();
const issue = new Issue();
issue.nominal = 1000;
issue.pricePct = 98.12;
issue.couponType = "fixed";
issue.couponRatePct = 14;
issue.periodDays = 182;
issue.maturity = "2029-01-12";
const market = new Market();
market.valuationDate = "2026-09-04";
market.keyRatePct = 16;
const r = derive_bond(issue, market);
console.log(r.error ?? r.ok.ytmMaturity);
```

`node/wasm.mjs` wraps the package behind the twin's API (plain objects
in and out, every struct freed); the parity test and the benchmark use
it.

TypeScript twin (`packages/yield-twin`, package `@tyche/yield-twin`, no
runtime dependencies): the same functions under the same names, taking and
returning plain objects; results are `{ ok }` or `{ error }`.

```ts
import { derive_bond } from "@tyche/yield-twin";

const r = derive_bond(
  {
    nominal: 1000, pricePct: 98.12, accrued: null, couponType: "fixed",
    couponRatePct: 14, spreadPct: 0, periodDays: 182, maturity: "2029-01-12",
    offers: [], amortization: [],
  },
  { valuationDate: "2026-09-04", keyRatePct: 16 },
);
if ("ok" in r) console.log(r.ok.ytmMaturity);
```

## Build

From the repository root:

```bash
cargo test --release -p tyche-yield
wasm-pack build crates/tyche-yield --release --target web --out-dir pkg --out-name tyche_yield -- --no-default-features --features wasm
```

The twin (pnpm, Node 22), from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @tyche/yield-twin build       # tsc to packages/yield-twin/dist
pnpm --filter @tyche/yield-twin typecheck
pnpm --filter @tyche/yield-twin test        # vitest against cases.json
```

## Parity

- `cases.json` holds 180 cases: 50 for the primitives (six of them
  edge cases, and three of `curve_yield_pct`'s), 25 for `derive_bond`,
  48 for `calculate`, 18 for `explain`, 19 for `g_spread` and 20 for
  `order_ticket`
  (amortisation, offers, floaters, both accounts, the 15 percent rate,
  the long-term holding relief on either side of the third anniversary
  and at its cap, moved valuation dates and every error code). NaN is
  written `"NaN"`. The expected values for `derive_bond` were computed by
  the TypeScript code these functions were ported from, not by either
  implementation here. Those for `calculate` were computed the same way
  until the tax, floater and reinvestment model changed; the cases it
  changed were recomputed by the twin and the Rust crate agrees with
  them. The new primitive cases and the error expectations are written by
  hand. The first 42 `calculate` cases take the usual fee, 0.05 percent,
  which was the fixed commission when their values were computed; the
  six with other fees, or fees it refuses, were computed by the Rust
  crate and the twin agrees with them. The `explain` cases reuse
  `calculate`'s issues and plans with a fee; their expected values were
  computed by the twin, and both runners also check that the years' tax
  adds up to the breakdown's, that the plan is `calculate`'s with the
  same fee, and that the discounted flows give the dirty price. The `explain` cases take the
  app's snapshot of the zero-coupon curve; the expected G-spreads in
  them, in the `g_spread` cases and in the `curve_yield_pct` cases were
  computed by the Rust crate, and the twin, written separately, agrees
  with them; both runners also check that `explain`'s G-spreads are
  `g_spread`'s. The `order_ticket` cases take issues from the other
  cases (a quoted accrued interest, an offer, amortisation, a floater)
  with limit prices and yields, lots, price steps and fees, and every
  error it returns; their values were computed by the Rust crate, and
  the twin agrees with them.
- `tests/worked.rs` and `packages/yield-twin/test/worked.test.ts` run the
  same worked examples, each a small issue whose results are computed by
  hand with the arithmetic in comments: a floater under a key-rate change, an
  amortising plan, tax netting with the accrued interest paid, the
  15 percent rate, the long-term holding relief and its cap, the
  shortest annualised horizon, and `explain`'s yield and fee, its tax
  year with a loss netted and with both rates, the accrued interest
  paid at purchase and received in a sale, `calculate`'s fee on the
  purchase and on a sale, and the G-spread at each
  duration, with the curve held flat beyond its terms and the curves it
  refuses; and the order ticket: the yield at a limit price with lots and
  the fee, for a buy and a sell, the price at a limit yield with the
  accrued interest, put on the price step either way, the yield to the
  offer, and the order of its errors.
- `tests/cases.rs` checks the Rust crate against the table;
  `packages/yield-twin/test/cases.test.ts` checks the twin.
- `node/parity.test.mjs` loads the built package and the built twin and
  checks, on every case, the WebAssembly build against the table, the
  twin against the table and the two against each other; then the two
  against each other on 1,000 issues, plans, fees, zero-coupon curves
  and orders from a seeded generator, including invalid inputs. Build `pkg/` and the twin first, then, from
  the repository root:

  ```bash
  pnpm parity
  ```

Tolerance everywhere: `|a - b| <= 1e-6 * max(|a|, |b|)`, so an expected
zero must be exactly zero; both NaN counts as equal; strings, booleans
and nulls compare exactly. No case needs a wider tolerance.

`node crates/tyche-yield/node/bench.mjs [runs]` times both implementations on the 60
fictional issues in `fixtures/issues60.json`.

## License

MIT OR Apache-2.0, at your option.
