# Tyche Bonds: the terminal app

The app of [Tyche Bonds](../../README.md). CI builds, tests and measures
it with the rest of the repository; the badges and what each one counts
are in the root README.

A bond-investing screen for the Russian bond market, in the browser: a
list of sixty fictional issues to search and filter, a card for each
issue with its figures and payment schedule, and a calculator for holding
it.

The bond mathematics is [tyche-yield](../../crates/tyche-yield): Rust
compiled to WebAssembly, with a separately written TypeScript twin
([`@tyche/yield-twin`](../../packages/yield-twin)). The interface is React
and TypeScript on the [Stoa](https://github.com/ghostjima/stoa) design
system.
Everything runs in the browser; there is no server.

Status: early. Performance record, with stamps:
[docs/MEASUREMENTS.md](docs/MEASUREMENTS.md).

## What it does

- **The list**: sixty generated issues (ten federal loan bonds, OFZ, and
  fifty corporate issues; fixed coupons, floaters on the key rate,
  amortising issues and issues with an offer). Search by issuer or
  ticker, word by word, with or without the ticker's hyphen, and for OFZ
  by the name in the interface's language ("ОФЗ 26217" in Russian); filter chips in groups (issuer, coupon, maturity, features),
  each with the count it would leave; sort by yield, maturity or rating.
  A search with no match says so and offers to clear the filters.
- **The issue**: clean and dirty price, accrued interest, yields to
  maturity and to the offer, the simple yield over the term, Macaulay
  and modified duration; the payment schedule as an event strip
  (coupons, amortisation, offer, maturity) and as a table per bond; for
  a fixed coupon, the dirty price against the yield.
- **The calculator**: amount, holding horizon (with presets for one year,
  the offer and maturity), reinvestment of coupons and of principal
  repaid early, the account (an ordinary brokerage account or an
  individual investment account of type B, which only accounts opened by
  the end of 2023 can be), the holder's other investment income for the
  15 percent rate above 2.4 million roubles a year, and a key-rate
  change. In a brokerage account tax is counted per calendar year, with
  a loss and the accrued interest paid netted against coupons, and the
  long-term holding relief on a gain held more than three years; the
  calculator says which rules apply at the chosen horizon and which
  revision of the Tax Code they follow. The result is the total at the
  horizon as a signed breakdown (income positive, tax and commission
  negative), the profit and the effective annual return, or the return
  over the period for a horizon under a month; the sale before maturity
  under the key-rate change (a fixed coupon's price moves by its
  duration, a floater's coupons follow the key rate and its price
  barely moves); for a floater, the key rate down 2, unchanged and up 2
  points, with the coupons under each; for an issue with an offer,
  selling back at the offer against holding on at a low coupon. Every
  input recalculates at once. An error the engine returns (an amount of
  zero, one that does not buy a bond, one over the limit) is a sentence
  with a way back to valid inputs.
- **Terms**: local terms keep their names (OFZ, key rate, LDV, IIS type
  B, offer); the inputs that use them say what they mean, and a Terms
  section explains each in a line.

The prices are as of a fixed valuation date, 4 September 2026, with the
key rate at 16 percent, so the figures are the same on every visit.

## Engines

The WebAssembly build is the default. If it cannot load, the TypeScript
twin computes the same figures and the page says so, with a retry. The
engine diagnostics (a button at the foot of the page, opening a sheet)
switch between the two, show the WebAssembly load time and the last
call's time, and time both engines on the issue and plan on screen. An
end-to-end test checks that both engines render identical figures for
the same inputs on four issues, and a unit test checks them against each
other, through the app's own adapters, on every issue with several
plans.

## Languages and themes

Russian first and by default, English second, with the same keys in each
(checked by a unit test). Numbers, money (roubles, with the sign) and
dates are written through Intl in the language's locale. The theme is
System, Light or Dark, System by default. Both are kept in the URL
(`?lang=ru|en`, `?theme=system|light|dark`) and in localStorage, under
`tyche.lang` and `tyche.theme`. `?issue=TICKER` opens an issue,
`?engine=twin` starts on the TypeScript engine.

## Accessibility

What the tests cover, and nothing wider:

- axe (`@axe-core/playwright`) finds no serious or critical violation in
  Russian and English, each in the light and the dark theme, on:
  the list, an issue with an offer (with the Terms open), a floater, the
  empty list, a calculation error, the diagnostics sheet with timings,
  the loading state and the WebAssembly fallback, at 1440 px; and the
  list and an issue at 375 px.
- Keyboard paths: `/` to the search, Tab to the issue list (one tab
  stop), the arrow keys through it and Enter to open an issue, the horizon and key-rate sliders by arrow and page keys, the
  reinvestment switch by Space, `?` for the shortcuts dialog, Escape to
  close it; on a phone, the page's Back button and the browser's Back
  both return to the list, with focus on the issue's row. The
  scroll keys scroll the page with nothing focused.
- No sideways page scroll at 1280 px and at 375 px, in each language.
- The header stays in place while the page scrolls under it, and the
  scrollbars are Stoa's.

No screen reader was tried by hand.

## Development

Stoa is linked from a sibling checkout: clone
[stoa](https://github.com/ghostjima/stoa) next to this repository and
build it (`pnpm install --frozen-lockfile && pnpm build` in `stoa/`).
The engine comes from this repository: build the WebAssembly package of
`crates/tyche-yield` with wasm-pack before installing, and the twin with
the workspace build. From the repository root:

```bash
pnpm wasm                      # wasm-pack build of crates/tyche-yield into its pkg/
pnpm install --frozen-lockfile
pnpm build                     # the twin, then the app
pnpm --filter terminal dev     # http://localhost:5181
pnpm --filter terminal test    # unit tests (vitest)
pnpm e2e                       # builds, serves on port 4176 and runs Playwright
pnpm --filter terminal measure # after pnpm build: the measurement tables
```

`pnpm e2e` builds the app every time and tests the build through
`vite preview` on 4176; `E2E_PORT` moves it to another port, as CI does:

```bash
E2E_PORT=4181 pnpm e2e
```

## Measurements

`pnpm --filter terminal measure` reads the page's marks `tyche:wasm-init`
and `tyche:list-ready`. The record below was taken before the move, when
they were named `horkos:`.

In Valkyra-Labs/horkos-bonds, before the move, at build `b2c8984`, in
headless Chromium 153 on an Apple M4 Pro, from a local server
([details and what they leave out](docs/MEASUREMENTS.md)):

- WebAssembly load and instantiate: 5.1 ms median over 10 cold loads;
  the list with all sixty issues derived is committed 102 ms after
  navigation start (median).
- Per call, median of 200 samples of 10-call means: derive_bond 0.09 ms
  in WebAssembly and 0.03 ms in TypeScript on a quarterly fixed issue;
  0.61 ms and 0.18 ms on the heaviest issue (a monthly floater with 99
  payments). calculate is within a few hundredths of a millisecond of
  derive_bond on each.
- A horizon step to the calculator's result committed: 7.9 ms median.
- Sizes: WebAssembly 64,861 bytes (24,975 gzipped); JavaScript 591,692
  bytes (180,677 gzipped).

## License

MIT OR Apache-2.0, at your option. Fonts: SIL Open Font License 1.1.
