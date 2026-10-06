//! Prints the calibration statistics of the default universe's first
//! day, the figures the tests in `tests/synth.rs` hold to their ranges.
//!
//! cargo run --release -p tyche-market --example synth_stats

use tyche_market::synth::{self, inputs, json, Segment};

fn pct(xs: &mut [f64], p: f64) -> f64 {
    xs.sort_by(f64::total_cmp);
    xs[((p * (xs.len() - 1) as f64).round()) as usize]
}

fn main() {
    let u = synth::generate(synth::DEFAULT_SEED, &inputs::fallback()).unwrap();
    println!(
        "issues {}, issuers {}, digest {:016x}",
        u.issues.len(),
        u.issuers.len(),
        json::universe_digest(&u)
    );
    for seg in [Segment::Government, Segment::Corporate] {
        let mut spreads = Vec::new();
        let mut depth = Vec::new();
        let mut trades = Vec::new();
        for (i, s) in u
            .issues
            .iter()
            .enumerate()
            .filter(|(_, s)| s.segment == seg)
        {
            let d = synth::simulate(u.seed, i, s, 0, None);
            if let Some(sn) = d.snapshots.iter().find(|x| x.time_ms == 46_800_000) {
                spreads.push(sn.spread_bp());
                if seg == Segment::Corporate || s.liquidity.rank < 0.5 {
                    depth.push(sn.bid_depth.min(sn.ask_depth) as f64);
                    depth.push(sn.bid_depth.max(sn.ask_depth) as f64);
                }
            }
            trades.push((s.liquidity.rank, d.prints.len()));
        }
        trades.sort_by(|a, b| a.0.total_cmp(&b.0));
        println!(
            "{seg:?}: spread p10 {:.2} p50 {:.2} p90 {:.2} max {:.1}; depth min {:.0} max {:.0}; trades top {:?} max {}",
            pct(&mut spreads, 0.1),
            pct(&mut spreads, 0.5),
            pct(&mut spreads, 0.9),
            pct(&mut spreads, 1.0),
            pct(&mut depth, 0.0),
            pct(&mut depth, 1.0),
            trades.iter().take(6).map(|t| t.1).collect::<Vec<_>>(),
            trades.iter().map(|t| t.1).max().unwrap()
        );
    }
}
