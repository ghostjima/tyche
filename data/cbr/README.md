# Bank of Russia snapshot

`snapshot.json` holds the Bank of Russia figures the terminal is built
on, as `scripts/cbr-snapshot.mjs` read them from cbr.ru:

- the key rate since 2013, as its changes, from the DailyInfo web
  service (`KeyRateXML`; also published at
  https://www.cbr.ru/hd_base/KeyRate/);
- RUONIA over a year, from the same service (`RuoniaXML`; also
  https://www.cbr.ru/hd_base/ruonia/);
- the zero-coupon yield curve of federal loan bonds over a month, from
  https://www.cbr.ru/hd_base/zcyc_params/; the curve is calculated by
  the Moscow Exchange (https://www.moex.com/a3642);
- inflation over twelve months by month since 2020, with the target
  and the key rate, from https://www.cbr.ru/hd_base/infl/ (sources:
  Rosstat and the Bank of Russia).

Each part records the URL it was read from and when. `latest` holds the
figures of the curve's latest date, which the app uses as its valuation
date.

Source: Bank of Russia, https://www.cbr.ru/. Its terms of use
(https://www.cbr.ru/user_agreement/) ask for a link to cbr.ru wherever
its material is quoted; the app shows one wherever it shows these
figures.

A scheduled workflow (`.github/workflows/cbr-data.yml`) takes a new
snapshot every day and commits it to the `cbr-data` branch. The app
does not read that branch: refreshing the figures here is a pull
request, so the figures, the tests and the screenshots change together.

```bash
node scripts/cbr-snapshot.mjs --out data/cbr/snapshot.json
```
