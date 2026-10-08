# tyche-market

Part of [Tyche Bonds](../../README.md). CI builds, tests and measures
this crate with the rest of the repository; the badges and what each one
counts are in the root README.

Order books in Rust, a deterministic synthetic bond market on them, and,
behind the `iex` feature, order-book reconstruction and replay for IEX
market data.

Status: early.

## The synthetic bond market

`synth` generates the universe Tyche Bonds shows and a trading day for
each issue. Nothing in it is market data: the issuers, codes, ratings,
prices, books and trades are invented, and the generator is calibrated
on aggregate figures only.

- **The universe** (`synth::generate(seed, inputs)`): 188 issues for the
  default seed, from a fictional treasury ("synthetic government bonds",
  codes such as `SG-143`, never a real federal loan bond number) and 72
  fictional companies in ten sectors. Fixed coupons, floaters on the key
  rate and on RUONIA, inflation-linked issues, amortising issues, put and
  call offers, subordinated issues, a qualified-investors-only flag, and
  ratings on a synthetic AAA to B scale with no agency, each issuer's with
  an outlook (stable, positive or negative, drawn from a stream of its
  own, a negative one likelier below BBB-).
- **Prices consistent with yields.** An issue's yield is the
  zero-coupon yield curve of federal loan bonds (the Bank of Russia's
  figures, passed in as `Inputs`) at the issue's duration, plus a
  spread for its rating and sector; its price is computed by
  [tyche-yield](../tyche-yield) and put on the price step, so the engine
  finds the yield back to within half a step. A linker's yield is real:
  the curve less inflation, priced on its indexed face value with no
  forecast of the indexation. A floater on RUONIA is passed to the
  engine as a key-rate floater with today's gap added to its spread.
- **A day** (`synth::simulate(seed, index, issue, day, until)`): the
  sessions of the exchange's published bond-market schedule (morning
  session with its opening auction, main session, closing auction,
  evening session; corporate issues open the main session with an
  auction), and an order book built message by message on the crate's
  `OrderBook`: the quoting side keeps ten levels a side around a mid
  price that wanders with the issue's duration, and each trade executes
  against them, best price first. Spreads are wider at the open and the
  close.
- **Calibration** (`synth::calibration`), on aggregate figures of the
  delayed exchange snapshot of 2026-10-06: price steps (0.001 percent of
  face for government issues, 0.01 or 0.0001 for corporate ones), lots
  (1, some 100 or 1,000), quoted spreads (government median 3.2 basis
  points, 10th percentile 0.2, 90th 14.6; corporate median 25, 10th
  percentile 3, a tail to about 1,000), visible depth per side (0.3 to
  1.3 million bonds on the liquid government issues, 6 to 80 thousand on
  corporate ones), trades a day (5 to 10 thousand on the top government
  issues, up to about a thousand on corporate ones) and trade sizes
  (median 3 bonds, 90th percentile 158, largest about 15,700). Every
  assumption added where the figures say nothing is named there.
- **Deterministic everywhere.** A seeded xoshiro256** sequence, and
  `exp`, `ln` and the normal quantile computed with the four basic
  operations only, so the same seed gives the same universe and days on
  Linux, macOS, Windows and in WebAssembly. JSON output rounds every
  number to a fixed count of decimals. The tests pin a digest of the
  universe and of a day's tape, and the app's unit tests check that the
  WebAssembly build gives the native digest.

- **Who may buy an issue** (`synth::access::gate(issue, issuer)`):
  anyone, a non-qualified investor after a passed test, or qualified
  investors only, with the reasons. The rules are read from the text of
  the Federal Law of 22 April 1996 No. 39-FZ "On the securities market"
  as amended up to the Federal Law of 4 August 2026 No. 283-FZ:
  article 3, paragraph 5 (a broker buys securities intended for
  qualified investors only for a qualified investor); article 3.1,
  paragraph 1, subparagraph 4 (a non-qualified individual's purchase
  needs a positive test, except for the securities of paragraph 2);
  paragraph 2, subparagraph 2 (no test for bonds of Russian issuers,
  issued under Russian law, whose bonds, issuer or guarantor are rated
  at least at the level the Bank of Russia's board sets) and
  subparagraph 5 (no test for government securities of the Russian
  Federation); and paragraph 7 (without a test, up to 300,000 roubles a
  year after the broker's notice of the risks and the investor's
  statement accepting them, an allowance of the investor, not of an
  issue). The level: the board's decision of 19 December 2025, applied
  from 1 July 2026, A+ on the national scale ("ruA+", "A+(RU)", "A+.ru",
  "A+|ru|") from at least two rating agencies. Subordinated bonds of a
  credit institution are for qualified investors (the Federal Law
  No. 395-1 "On banks and banking", article 25.1, fourteenth part). So:
  a subordinated issue of a bank, or an issue whose terms restrict it to
  qualified investors (every subordinated one's do), is for them only; a
  synthetic government bond is open to everyone; a corporate issue rated
  below A+ needs a test; the rest are open. What the synthetic universe
  adds, as its assumptions: every issuer is Russian and every issue is
  under Russian law, none structural, convertible or perpetual; a
  synthetic rating stands for the national-scale rating two agencies
  would give, notch for notch; a floater's coupon (an index plus a fixed
  spread) and a linker's indexed face value are gated as a fixed coupon,
  a reading the law's text does not settle (it names interest rates and
  inflation among the circumstances that make payments structured; read
  the other way, such issues would need a test or be closed to
  non-qualified investors), and the card says so for each such issue.
- **A holding's events** (`synth::holding_events(universe, index,
  bonds)`): its coupons, amortisations and maturity from the issue's
  terms through tyche-yield (a floater's and a linker's coupons projected
  at today's index), its put offer with the window to ask for redemption
  (the five working days that end three working days before the offer
  date; the last is the deadline) or its call offer with the day the
  issuer gives notice by (ten working days before), and a scenario drawn
  from the seed, one stream per issuer: a rating change of a notch in the
  last 180 days that ended at today's rating, one ahead likelier in the
  outlook's direction, and, for issuers rated BB- or lower, a payment
  missed on a payment day in the year ahead, made within ten working
  days or not, and then a default after which nothing more is paid.
  Working days are Monday to Friday, with no holiday calendar. Every one
  of these is a rule of the synthetic universe, not a statement about a
  real issuer.
- **The depth check** (`depth::depth_check(levels, side, bonds,
  limit)`): how much of a limit order the visible book fills at once at
  or better than the limit, taking the opposite side best price first as
  the day's trades execute: the bonds filled and left, the best price,
  the size-weighted average and the last level reached, the levels used,
  each level's fill, and the slippage, the average's distance from the
  best price in basis points of it (worse is positive). Only visible size
  counts: no hidden orders, nothing that arrives while the order is
  sent.
- **Placements** (`synth::placements(universe)`): four new issues of
  fictional issuers rated BB or better, each the issuer's next series,
  placed by book-building around the valuation date, from a stream of
  the seed: one book closed a few working days before, two open (one
  closing within two working days) and one to open. Each has the book's
  first and last working day, the settlement three working days after
  the close, a term of one to five years, a coupon paid monthly,
  quarterly or twice a year, and a size. The coupon guidance's top is the
  coupon whose annual yield is the zero-coupon curve at the term plus
  the issuer's credit and sector spreads and a new-issue premium of 0.3
  to 0.8 points, on a step of 0.05 points; the range is half a point to a
  point wide. Once the book has closed, a demand drawn between 0.8 and
  3.6 times the size sets the final coupon, from the top of the guidance
  (demand of the size or less) down to its bottom (2.5 times the size or
  more), linearly between, on the step, and the allotment of a request
  without a coupon limit, the size over the demand (all of it when the
  book is not covered). Rules of the synthetic universe, not statements
  about any real placement; the tests pin the JSON's digest.

`cargo run --release -p tyche-market --example synth_stats` prints the
calibration statistics of the default universe's first day.

The WebAssembly build (`--no-default-features --features wasm`) holds
only the synthetic market and the book (`SynthMarket`: the universe and
an issue's day as JSON, who may buy each issue (`accessJson`), a
holding's events (`eventsJson`), the placements (`placementsJson`) and a
depth check against an issue's book at a moment of a day (`depthJson`));
the app runs it in a worker.

## IEX decoding (feature `iex`, on by default)

The product does not use it; it stays for its tests and the command
line below.

- Reads classic pcap and pcapng, gzip or not, from a file or a stream.
- Parses IEX Transport Protocol v1 segments; detects duplicate and
  missing sequence numbers.
- Decodes DEEP (v1.08) and DEEP+ (v1.05) messages.
- Keeps an order-by-order book (add, modify, delete, execute, clear) and
  a price-level book, with counters for anything that does not fit.
- Cuts a few symbols out of a day, or out of an existing `.tyc`, into a
  small capture file for demos.
- Replays one symbol's day with seeking (a book snapshot every 20,000
  messages), the book midpoint and a liquidity heatmap. A replay has
  size limits (256 MiB of capture, 6 million messages, 10,000 resting
  orders and 5,000 price levels on the book by default, about twice the
  largest measured day and far above its deepest book), so a capture
  from an unknown source fails with a coded error instead of taking
  unbounded memory.
- Refuses damaged pcap input with an error rather than a panic, and
  records or blocks over 256 KiB before reading them.
- Runs the DEEP+ versus DEEP parity check.

Measured on 2026-09-24 for AAPL, NVDA, QQQ, SPY and TSLA (9.8 million
checkpoints): the book rebuilt from DEEP+ equals DEEP at every event
end, with no unknown, duplicate or overfilled orders; the whole day
checks in 2.5 s. Method, stamps and limits:
[docs/MEASUREMENTS.md](docs/MEASUREMENTS.md).

## Command line

```bash
cargo install --path crates/tyche-market --features gzip
```

Stream a day from IEX and keep only a few symbols, without storing the
full file:

```bash
curl -s "$DEEP_PLUS_URL" | tyche extract --symbols AAPL,SPY -o day_deepplus.tyc -
```

```bash
tyche parity day_deep.tyc day_deepplus.tyc --show 5
```

Download links for each day are listed by
`https://iextrading.com/api/1.0/hist?date=YYYYMMDD`.

## Data

Data provided for free by IEX. By accessing or using IEX Historical Data,
you agree to the IEX Historical Data Terms of Use
(https://www.iex.io/legal/hist-data-terms). IEX data reflects trading on
IEX only and is not a basis for trading decisions.

## License

MIT OR Apache-2.0, at your option.
