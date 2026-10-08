# Tyche Bonds

[![CI](https://github.com/ghostjima/tyche/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ghostjima/tyche/actions/workflows/ci.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/License-MIT%20OR%20Apache--2.0-blue.svg)](#license)
[![MSRV 1.85](https://img.shields.io/badge/MSRV-1.85-blue.svg)](Cargo.toml)

## In one minute

Tyche Bonds is a bond terminal for retail investors in Russian bonds, in
the browser: from the investor's goal to the order, with the risk of an issue shown at
the moment the decision is made and the yield shown honestly, after tax
and fees and without hidden reinvestment. It is for a non-qualified
investor looking for an alternative to a deposit, and for an active
retail investor. The key decision: every figure comes from one bond
engine, written in Rust, compiled to WebAssembly and checked against a
separately written TypeScript twin, so a number on screen can be traced
and tested; the market is a synthetic universe of fictional issuers, so
nothing on screen is licensed exchange data.

Status: early. What runs today is a prototype screen for a synthetic
universe of 188 fictional issues (a list, an issue card and a holding
calculator) on the engine;
the terminal's flows are being built on top of it (see
[What comes next](#what-comes-next)). Not investment advice.

## Problem

- A study of twelve Russian broker apps found that bonds matter more and
  more to investors, but the market has no good scenario for choosing
  them, and pointed to financial marketplaces, where choosing a deposit
  is simple, as the reference
  ([Markswebb, Digital Investment Rank 2025](https://www.markswebb.ru/upload/iblock/uploads/Markswebb_Digital_Investment_Rank_2025.pdf)).
- In 2025, 163 thousand individuals made deals in problem bonds, against
  48 thousand in 2024, according to the Bank of Russia's review of
  financial instruments for 2025
  ([Expert, 13 March 2026](https://expert.ru/news/tsb-zafiksiroval-rost-chisla-postradavshikh-chastnykh-investorov-ot-defoltov-po-obligatsiyam/)).
- The pains investors document are concrete: a missed offer date
  ([Smart-Lab](https://smart-lab.ru/blog/975506.php)), amortisation and
  coupon resets they did not see, and an effective yield that assumes
  reinvestment and ignores tax
  ([T-Journal](https://t-j.ru/list/hidden-bond-threats/)); a "qualified
  investors only" flag shown wrongly
  ([Smart-Lab](https://smart-lab.ru/blog/1020934.php)); an issue they
  cannot sell.
- Independent tools ([Dohod](https://dohod.ru/analytic/bonds),
  [BondRadar](https://bondradar.pro/)) offer goal presets, ladders and
  coupon calendars, and the Moscow Exchange launched its own screener on
  13 July 2026 ([Moscow Exchange](https://www.moex.com/n102042)); none of
  them runs from the goal to the order in one flow.

## Users and workflows

Users: a non-qualified retail investor who wants something better than
a deposit; an active retail investor who compares issues and builds a
ladder.

Workflows:

1. **Goal first.** "Instead of a deposit", "monthly income" or "money by
   a date" set the filters; the professional filters (yield to maturity
   or to the offer, duration, rating, coupon type and frequency, offer
   and amortisation, qualified only, liquidity) sit below.
2. **The issue card, with the risk where the decision is made.** The
   offer and its date with a countdown, the amortisation schedule, call
   or put, subordination, the rating and its outlook (from a fictional
   agency), the qualified-investor badge, a liquidity warning from the
   order book; the yield to maturity and to the offer, after tax at 13 or
   15 percent and after fees, with the working shown.
3. **Compare and find analogues**, side by side and on a map of peers by
   rating and duration.
4. **Plan cash flows**: a coupon calendar, monthly income, a ladder.
5. **The order ticket**: price in percent of face, accrued interest
   added, lots, the yield at the limit price, a depth check against the
   order book, the qualification gate, confirmation.
6. **Events**: coupons, offers with an action deadline and a one-step
   request to redeem at the offer, rating changes, defaults.

Today the prototype covers the first three workflows, the
single-issue calculator, the events of a synthetic portfolio with its
monthly coupon income, a ladder builder, and placements by
book-building: see [What is built](#what-is-built).

## Constraints

- **Not advice.** The terminal is a demonstration; it gives no
  investment advice and places no real orders.
- **Tax.** Personal income tax on bonds follows the Tax Code of the
  Russian Federation, part two (articles 214.1, 219.1 and 224), with the
  revision the engine follows named in the interface; the 13 and 15
  percent rates, the 2.4 million rouble threshold shared with the
  holder's other investment income, and the long-term holding relief.
- **Data and licensing.** The rules the terminal's data follows, and
  what the interface shows of them.
  - The bond universe is fully synthetic: fictional issuers, calibrated
    on aggregate statistics only. No per-security series from an
    exchange is committed.
  - The Bank of Russia's key rate, RUONIA, the zero-coupon curve of
    federal loan bonds (calculated by the Moscow Exchange) and inflation
    are used as a snapshot ([`data/cbr`](data/cbr)) with a link to
    cbr.ru, as its terms of use ask, crediting the Moscow Exchange for
    the curve. A scheduled job takes a new snapshot every day; the app
    moves to it through a pull request.
  - No Moscow Exchange market data is stored or displayed, and there is
    no live exchange mode in the browser.
  - No ratings from rating agencies (АКРА, Эксперт РА) and no data from
    Cbonds.
  - Every widget names its source (SIM for the synthetic universe, or
    the Bank of Russia), a persistent banner says the terminal is a demo
    and not investment advice, and a "Data and licensing" page lists the
    sources and their terms.
  - tyche-market's tests use two small sample captures that IEX
    publishes, under the IEX Historical Data Terms of Use (see its
    README).
- **Accessibility.** Claims are only as wide as the tests behind them:
  axe sweeps over named states, keyboard paths, no sideways scroll at
  named widths (listed in the app's README).

## Decisions

- **One engine, two implementations.** The bond mathematics is Rust
  compiled to WebAssembly, and a separately written TypeScript twin
  computes the same functions; a shared table of cases and a parity run
  over generated issues hold them together. Rejected: a single
  TypeScript implementation, which nothing would check independently;
  computing on a server, which a static page cannot have.
- **Synthetic market, real macro data.** Rejected: Moscow Exchange data.
  Its public interface allows viewing only; storing and republishing it
  on a public site needs a distribution contract. A mode in which the
  visitor's browser fetches delayed exchange data was also rejected: the
  page would still show exchange data to the public. Scraping ratings or
  Cbonds is ruled out by their terms.
- **The order book in Rust.** tyche-market already holds a tested order
  book and replay; a synthetic bond-market generator joins it, so the
  depth check in the order ticket comes from a deterministic, tested
  engine. Rejected: a TypeScript generator in the app.
- **Everything in the browser.** A static site, no server and no
  account: nothing to operate, and nothing personal is collected.
- **Languages.** Russian first and English second, because the users
  and the market are Russian. Rejected: a third, right-to-left language
  in the product, which doubles the accessibility matrix without a user
  who needs it; the right-to-left proof stays in Stoa.

## What is built

- **The prototype screen** ([`apps/terminal`](apps/terminal)): the
  synthetic universe (synthetic government bonds and corporates; fixed
  coupons, floaters on the key rate and on RUONIA, inflation-linked and
  amortising issues, put and call offers, subordinated and
  qualified-only issues) to choose from by goal ("instead of a deposit",
  "monthly income", "money by a date"), each setting filters that stay
  visible and can be changed, with the professional filters below them,
  and to search and sort; an issue card with its risks where the
  decision is made (the offer with a countdown, amortisation,
  subordination, a floater's coupon resets, the rating's outlook, the
  qualified-investor flag and what it means, a liquidity warning with
  its thresholds), the yield to maturity and to the offer after the
  broker's fee (a field, one value for the session, kept in the link)
  and after tax without reinvestment, with the working shown step by
  step and the Tax Code articles cited, clean and dirty price, accrued
  interest, durations and the payment schedule; the issue's analogues
  (a similar rating and duration) on a map of peers, and up to three
  issues compared side by side, with the G-spread of each to the Bank
  of Russia's zero-coupon curve of federal loan bonds; a holding calculator with reinvestment, the
  account type, tax per calendar year and a key-rate change; a
  synthetic portfolio kept in the link, with its events by date
  (payments, offers with the window and the deadline, and a one-step
  request to redeem at a put offer, recorded in the browser only and
  never an order; rating changes and defaults from the synthetic
  universe's scenario) and its coupon income by month; a ladder builder
  (a horizon and an amount, an issue proposed for each year from the
  filters and changeable, each rung after the fee and the rungs' tax
  worked out together by the engine, one base a year, so a loss on one
  rung is netted against another and the rungs share the threshold of
  the 13 percent rate, with the working shown; the ladder's yield after
  tax and the fee, the payments by year and every assumption, kept in
  the link); placements of new synthetic issues by book-building
  (each book's window with a countdown in working days, the coupon
  guidance, the final coupon once the book has closed and what an
  indicative request was allotted, with the rules that set them); the
  Bank of Russia's benchmarks with the yield curve. Every widget names its
  source (SIM, or the Bank of Russia with the date and a link to
  cbr.ru), a banner in the header says the terminal is a demonstration
  with synthetic data and not investment advice, and a "Data and
  licensing" page lists every source, its terms and what is synthetic.
  Russian first, English second; light and dark themes. It will be served at
  ghostjima.github.io/tyche once Pages is enabled.
- **The bond engine** ([`crates/tyche-yield`](crates/tyche-yield)) and
  its **TypeScript twin** ([`packages/yield-twin`](packages/yield-twin)):
  price and yield, duration, cash flows with amortisation and offers,
  floaters, tax and holding-period results, the G-spread to the Bank of
  Russia's zero-coupon curve at the issue's duration, an order ticket's
  figures (the yield at a limit price or the price at a limit yield, with
  the accrued interest, lots and the fee), and the working
  behind them: the yields solved from the discounted flows, the yields
  after a broker's fee and after tax without reinvestment, the G-spreads,
  and the tax year by year; and the tax of several holdings together,
  their tax years combined into one base per calendar year.
- **The market engine** ([`crates/tyche-market`](crates/tyche-market)):
  the synthetic universe and a trading day per issue (the exchange's
  session schedule, an order book built message by message, a tape),
  seeded and the same on every platform, calibrated on aggregate figures
  only; priced by the bond engine from the zero-coupon yield curve. It
  also says who may buy each issue (anyone, after a test, or qualified
  investors only) by the law on the securities market and the banking
  law as amended up to 4 August 2026, at the rating level the Bank of
  Russia's board set from 1 July 2026, with the synthetic ratings read
  as national-scale ratings (an assumption stated apart from the rule),
  lists a holding's events (payments,
  offers with the window to act in, and a scenario of rating changes and
  defaults), checks an order's depth against an issue's book (filled
  at or better than the limit, the average price, the slippage, the
  levels used), and places new issues of its fictional issuers by
  book-building around the valuation date (the book's window, the coupon
  guidance from the zero-coupon curve and the issuer's spreads, the final
  coupon and the allotment from the book's demand, a scenario of its
  seed). The app runs its WebAssembly build in a worker. The IEX decoding stays
  behind a feature for its tests; the product does not use it.
- **The Bank of Russia snapshot** ([`data/cbr`](data/cbr)): the key
  rate, RUONIA, the zero-coupon yield curve and inflation, each with the
  URL it was read from and when, taken by a script
  (`scripts/cbr-snapshot.mjs`) that a scheduled workflow runs every day
  into the `cbr-data` branch.

The interface is built on [Stoa](https://github.com/ghostjima/stoa), the
design system of this product and of Ariadne Desk.

## What comes next

- The order ticket's screen against the synthetic order book.
- In the engine: inflation-linked bonds with forecast indexation. In the
  app: the
  order book and the tape of the synthetic market.

## Validation plan and target metrics

None of these has been measured yet; each is a hypothesis to test on the
prototype, and its target is set only after a first baseline.

- **Goal to order.** A first-time bond buyer who states a goal reaches a
  confirmed order ticket for a matching issue without help. Measure:
  task success and time from the goal to the confirmed ticket, in
  moderated sessions.
- **Risk seen in time.** With the offer, amortisation, liquidity and
  qualification shown in the card, a participant names the risks of an
  issue before ordering. Measure: share of participants who name the
  offer date and the amortisation of an issue that has them, against a
  card without them.
- **Honest yield understood.** A participant can tell the yield after
  tax and fees from the headline yield. Measure: share of correct answers
  to "how much will you receive in a year" on a fixed issue and plan.
- **Engine trust.** Measured continuously, not a hypothesis: the parity
  badge below counts the cases and generated issues on which the two
  implementations agree on every CI run.

## Measured quality

Published by CI from each green run on `main` to the `badges` branch;
the commit that branch's latest entry names is the commit measured. What
each badge counts is under [Badges](#what-each-badge-counts).

[![tyche-yield tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/yield-tests.json)](#what-each-badge-counts)
[![twin tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/twin-tests.json)](#what-each-badge-counts)
[![parity](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/parity.json)](#what-each-badge-counts)
[![tyche-yield wasm gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/yield-wasm-size.json)](#what-each-badge-counts)
[![tyche-market tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/market-tests.json)](#what-each-badge-counts)
[![tyche-market wasm gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/market-wasm-size.json)](#what-each-badge-counts)
[![unit tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/unit-tests.json)](#what-each-badge-counts)
[![e2e](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/e2e.json)](#what-each-badge-counts)
[![axe](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/axe.json)](#what-each-badge-counts)
[![Lighthouse accessibility](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/lighthouse-accessibility.json)](#what-each-badge-counts)
[![Lighthouse best practices](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/lighthouse-best-practices.json)](#what-each-badge-counts)
[![Lighthouse SEO](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/lighthouse-seo.json)](#what-each-badge-counts)
[![bundle gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/bundle-size.json)](#what-each-badge-counts)

### What each badge counts

`scripts/badges.mjs` builds them from the run's own output and stops,
publishing nothing, when a value cannot be read or a run did not pass.

- tyche-yield tests, tyche-market tests: tests passed in `cargo test
  --release` of each crate on Linux, default features (unit,
  integration and doc tests).
- twin tests: Vitest tests passed in `packages/yield-twin`.
- parity: the number of cases (`crates/tyche-yield/cases.json`) and of
  generated issues on which the WebAssembly build and the twin agree
  within 1e-6 relative, as each parity test reports it once it has
  passed.
- tyche-yield wasm gzip, tyche-market wasm gzip: the WebAssembly module
  CI builds with wasm-pack (`--no-default-features --features wasm`),
  gzip level 9.
- unit tests: Vitest tests passed in `apps/terminal`.
- e2e: Playwright tests passed in Chromium against `vite preview` of the
  app's build.
- axe: axe-core 4.13.0 in the e2e, over the app's named states in each
  language and theme; a serious or critical violation fails the run.
  The badge gives the number of distinct states and of language and
  theme pairs, read from the scans the e2e records; a state not scanned
  in every pair, or an axe test that recorded no scan, stops the script.
- Lighthouse: Lighthouse 13 accessibility, best practices and SEO scores
  of the app's home page served by `vite preview`, the lower of the
  desktop and mobile runs. Performance is not shown: on a shared CI
  runner it measures the runner.
- bundle gzip: every JavaScript and CSS file in the app's `dist/`, gzip
  level 9, summed; the WebAssembly, the fonts and `index.html` are not
  included.

CI also checks the minimum supported Rust version, 1.85, with `cargo
+1.85 check`.

## Repository

| Path | What |
|---|---|
| `apps/terminal` | the app (React, TypeScript, Vite) |
| `crates/tyche-yield` | the bond engine (Rust, WebAssembly) and its parity tests (`node/`) |
| `packages/yield-twin` | the engine's TypeScript twin, `@tyche/yield-twin` |
| `crates/tyche-market` | the synthetic market and the order book (Rust, WebAssembly); IEX replay behind a feature |
| `data/cbr` | the Bank of Russia snapshot the app is built on |
| `scripts` | the house-style check, the badge builder and the Bank of Russia snapshot |

A Cargo workspace and a pnpm workspace share the root. The app links
Stoa from a sibling checkout (`../stoa`, built); how to build and test
everything is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Role

Timur Khubaev ([ghostjima](https://github.com/ghostjima)): research,
product and interaction design, the Stoa design system, the engines and
the front end.

## License

MIT OR Apache-2.0, at your option. Fonts: SIL Open Font License 1.1. The
IEX sample captures in `crates/tyche-market/tests/fixtures` are IEX's,
under the IEX Historical Data Terms of Use.
