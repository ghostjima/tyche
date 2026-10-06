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
  ratings on a synthetic AAA to B scale with no agency.
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

`cargo run --release -p tyche-market --example synth_stats` prints the
calibration statistics of the default universe's first day.

The WebAssembly build (`--no-default-features --features wasm`) holds
only the synthetic market and the book (`SynthMarket`: the universe and
an issue's day as JSON); the app runs it in a worker.

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
