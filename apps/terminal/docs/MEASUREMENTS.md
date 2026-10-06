# Measurements

Taken in Valkyra-Labs/horkos-bonds before the code moved into this repository:
the build stamps below are commits of that repository, and the app was then
Horkos Bonds and linked the engine from the horkos-yield repository.
None of these numbers has been measured again here yet.

Every number in the README comes from here, with its stamp.

Host: Apple M4 Pro (12 CPU cores), 24 GB, macOS 26.6.2. Node v22.18.0,
pnpm 11.25.0, Vite 8.3.1. Browser: the headless Chromium 153.0.8010.12
that Playwright 1.63.0 installs.

Engine: horkos-yield at `ecb3edf`, its WebAssembly package (`pkg/`, built
with wasm-pack, release profile with LTO and one codegen unit) and its
TypeScript twin (`twin/dist`), linked as they were on disk.

How: `pnpm build`, then `node scripts/measure.mjs 10 100`, which serves
`dist/` with `vite preview` on port 4176 and drives Chromium. The script
prints the tables below with the stamp line; they are copied here as
printed, with the explanations beside them.

## Build `b2c8984` (clean tree)

### Load

Cold loads: 10, each in a new browser context (empty cache),
`/?issue=OKAD-01`, 1440 x 900. Median and 95th percentile (nearest rank)
over the loads, milliseconds:

| metric | what it measures | median | p95 |
|---|---|---|---|
| first contentful paint | navigation start to the first paint with content (the header and the loading skeleton) | 60.0 | 128.0 |
| WebAssembly load and instantiate | `await init()`: fetch of the .wasm from the local server, compile and instantiate | 5.1 | 6.1 |
| list ready | navigation start to the commit of the first render with all sixty issues derived (the mark `horkos:list-ready`) | 101.9 | 105.4 |

The load is from a server on the same machine, so the fetch costs almost
nothing; over a network the WebAssembly fetch adds its transfer time
(25 KB gzipped).

### Engine calls in the browser

From the diagnostics sheet's "Time both engines" (the same code a viewer
runs): per call, median and 95th percentile over 200 samples, each sample
the mean of 10 consecutive calls, after 20 warm-up batches; one run per
issue, in one warm page. A batch is timed rather than one call because
the page's clock has a resolution of 0.1 ms (it is not cross-origin
isolated) and one call takes less than that; so the 95th percentile is of
10-call means, not of single calls, and values are quantised to 0.01 ms.
Times include building the inputs and turning the results into plain
objects (for WebAssembly: setting struct fields, reading every getter,
freeing every struct, copying arrays out of `Float64Array`s).

| issue | engine | function | median | p95 |
|---|---|---|---|---|
| OKAD-01 (fixed, offer, 91-day coupon, 10 payments) | WebAssembly | derive_bond | 0.090 ms | 0.100 ms |
| OKAD-01 | WebAssembly | calculate | 0.090 ms | 0.090 ms |
| OKAD-01 | TypeScript | derive_bond | 0.030 ms | 0.030 ms |
| OKAD-01 | TypeScript | calculate | 0.030 ms | 0.030 ms |
| AMRT-02 (floater, amortising, offer, 30-day coupon, 99 payments) | WebAssembly | derive_bond | 0.610 ms | 0.620 ms |
| AMRT-02 | WebAssembly | calculate | 0.630 ms | 0.650 ms |
| AMRT-02 | TypeScript | derive_bond | 0.180 ms | 0.190 ms |
| AMRT-02 | TypeScript | calculate | 0.210 ms | 0.220 ms |
| ANGM-01 (fixed, amortising, 16 payments) | WebAssembly | derive_bond | 0.080 ms | 0.090 ms |
| ANGM-01 | WebAssembly | calculate | 0.080 ms | 0.080 ms |
| ANGM-01 | TypeScript | derive_bond | 0.020 ms | 0.030 ms |
| ANGM-01 | TypeScript | calculate | 0.020 ms | 0.030 ms |
| OFZ-26217 (fixed, 182-day coupon, 20 payments) | WebAssembly | derive_bond | 0.100 ms | 0.100 ms |
| OFZ-26217 | WebAssembly | calculate | 0.090 ms | 0.100 ms |
| OFZ-26217 | TypeScript | derive_bond | 0.030 ms | 0.040 ms |
| OFZ-26217 | TypeScript | calculate | 0.030 ms | 0.040 ms |

On this load shape, in Chromium, the TypeScript twin takes about a third
of the WebAssembly engine's time per call. The engine's own record found
the twin faster under Node too, by 14 to 18 percent on its 60-issue
workload; the gap here is wider, and where the WebAssembly time goes
(boundary crossings, array copies, the computation) was not profiled.
Either engine stays under 1 ms per call on every issue measured, which is
why the calculator recalculates synchronously on every input change.

### Interactions

On `/?issue=AMRT-02` (the heaviest issue above), 100 steps each, 20 ms
apart, milliseconds. "commit" is from the event dispatched to the DOM
under the watched element changing (React committed); "frame" is to the
next animation frame after that. Neither includes the browser's own input
latency or the paint itself:

| interaction | commit median | commit p95 | frame median | frame p95 |
|---|---|---|---|---|
| horizon slider, one key step, to the calculator's result | 7.90 | 8.80 | 11.65 | 16.40 |
| filter chip press (a virtual click), to the list | 7.45 | 9.80 | 12.30 | 13.20 |

### Sizes

Files in `dist/assets`, bytes; gzip is level 9 (Node zlib). Fonts are
left out (Plex Sans, Plex Sans Arabic, Plex Mono and Noto Sans Arabic,
loaded per script and weight as the page needs them).

| file | raw | gzip |
|---|---|---|
| index-BbwXLkek.js (the app, React, React Aria, Stoa and the twin) | 591,692 | 180,677 |
| index-CsWYrve-.css | 84,940 | 18,794 |
| horkos_yield_bg-H731wbNd.wasm | 64,861 | 24,975 |

The WebAssembly module is byte for byte the size the engine's record
gives for its build `36282c7`. The app is one JavaScript chunk; it was not
split.

What this does not show: other browsers, a phone, a network between
browser and server, memory, or the time to interactive under a throttled
CPU.
