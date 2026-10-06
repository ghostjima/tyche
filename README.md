# Tyche Bonds

[![CI](https://github.com/ghostjima/tyche/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ghostjima/tyche/actions/workflows/ci.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/License-MIT%20OR%20Apache--2.0-blue.svg)](#license)
[![MSRV 1.85](https://img.shields.io/badge/MSRV-1.85-blue.svg)](Cargo.toml)

A bond terminal for retail investors in Russian bonds, in the browser:
from the investor's goal to the order, with the risk of an issue shown at
the moment the decision is made and the yield shown honestly, after tax
and fees and without hidden reinvestment. It is for a non-qualified
investor looking for an alternative to a deposit, and for an active
retail investor. The key decision: every figure comes from one bond
engine, written in Rust, compiled to WebAssembly and checked against a
separately written TypeScript twin, so a number on screen can be traced
and tested; the market is a synthetic universe of fictional issuers, so
nothing on screen is licensed exchange data.

Status: early. What runs today is a prototype screen for sixty fictional
issues (a list, an issue card and a holding calculator) on the engine;
the terminal's flows are being built on top of it (see
[What comes next](#what-comes-next)). Not investment advice.

## The problem

- A study of twelve Russian broker apps (Markswebb, Digital Investment
  Rank 2025) found no app with a good bond-selection scenario, and
  pointed to deposit marketplaces as the reference.
- The Bank of Russia counted 163 thousand retail investors holding
  defaulted bonds in 2025, against 48 thousand in 2024.
- The pains investors document are concrete: a missed offer date,
  amortisation they did not see, a "qualified investors only" flag shown
  wrongly, an issue they cannot sell, and an effective yield that assumes
  reinvestment and ignores tax.
- Independent tools (Dohod, BondRadar) offer goal presets, ladders and
  coupon calendars, and the Moscow Exchange launched its own screener in
  July 2026; none of them runs from the goal to the order in one flow.

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

Today the prototype covers part of the second workflow and the
single-issue calculator: see [What is built](#what-is-built).

## Constraints

- **Not advice.** The terminal is a demonstration; it gives no
  investment advice and places no real orders.
- **Tax.** Personal income tax on bonds follows the Tax Code of the
  Russian Federation, part two (articles 214.1, 219.1 and 224), with the
  revision the engine follows named in the interface; the 13 and 15
  percent rates, the 2.4 million rouble threshold shared with the
  holder's other investment income, and the long-term holding relief.
- **Data and licensing.** The rules the terminal's data follows. The
  prototype's sixty issues are already fictional; the source labels,
  the banner and the licensing page arrive with the synthetic universe.
  - The bond universe is fully synthetic: fictional issuers, calibrated
    on aggregate statistics only. No per-security series from an
    exchange is committed.
  - The Bank of Russia's key rate, RUONIA, the zero-coupon curve of
    federal loan bonds (calculated by the Moscow Exchange) and inflation
    may be used as snapshots with a link to cbr.ru, crediting the Moscow
    Exchange for the curve.
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
  and the market are Russian. The prototype still opens in English and
  also speaks Arabic, the right-to-left proof it shares with Stoa.

## What is built

- **The prototype screen** ([`apps/terminal`](apps/terminal)): sixty
  fictional issues (federal loan bonds and corporates; fixed coupons,
  floaters on the key rate, amortising issues, issues with an offer) to
  search, filter and sort; an issue card with clean and dirty price,
  accrued interest, yields to maturity and to the offer, durations and
  the payment schedule; a holding calculator with reinvestment, the
  account type, tax per calendar year and a key-rate change. English,
  Russian and Arabic; light and dark themes. It will be served at
  ghostjima.github.io/tyche once Pages is enabled.
- **The bond engine** ([`crates/tyche-yield`](crates/tyche-yield)) and
  its **TypeScript twin** ([`packages/yield-twin`](packages/yield-twin)):
  price and yield, duration, cash flows with amortisation and offers,
  floaters, tax and holding-period results.
- **The market engine** ([`crates/tyche-market`](crates/tyche-market)):
  order-book reconstruction and replay, today for IEX's DEEP and DEEP+
  feeds.

The interface is built on [Stoa](https://github.com/ghostjima/stoa), the
design system of this product and of Ariadne Desk.

## What comes next

- The synthetic universe of fictional issuers and the Bank of Russia
  snapshot, with the source on every widget, the demo banner and the
  "Data and licensing" page.
- Goal-first selection; the issue card with the risk and the yield after
  tax and fees, with the working shown; comparison; the order ticket
  against a synthetic order book; events.
- In the engine: a per-year trace of tax and accrued interest, portfolio
  and ladder cash flows, yield after fees, the G-spread to the curve,
  inflation-linked bonds. In the market engine: the synthetic bond
  market generator; the IEX decoding leaves the product.
- Russian as the first language; Arabic leaves the product and stays in
  Stoa.

## Validation plan and target metrics (hypotheses)

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
each badge counts is under [Badges](#badges).

[![tyche-yield tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/yield-tests.json)](#badges)
[![twin tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/twin-tests.json)](#badges)
[![parity](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/parity.json)](#badges)
[![tyche-yield wasm gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/yield-wasm-size.json)](#badges)
[![tyche-market tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/market-tests.json)](#badges)
[![tyche-market wasm gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/market-wasm-size.json)](#badges)
[![unit tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/unit-tests.json)](#badges)
[![e2e](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/e2e.json)](#badges)
[![axe](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/axe.json)](#badges)
[![Lighthouse accessibility](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/lighthouse-accessibility.json)](#badges)
[![Lighthouse best practices](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/lighthouse-best-practices.json)](#badges)
[![Lighthouse SEO](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/lighthouse-seo.json)](#badges)
[![bundle gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/tyche/badges/bundle-size.json)](#badges)

### Badges

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
- Lighthouse: Lighthouse 12 accessibility, best practices and SEO scores
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
| `crates/tyche-market` | the order book and replay engine (Rust, WebAssembly) |
| `scripts` | the house-style check and the badge builder |

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
