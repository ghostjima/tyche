//! A seeded random sequence: xoshiro256** (Blackman and Vigna), seeded
//! through SplitMix64, with the draws the generator needs. Integer
//! arithmetic and [`super::det`], so a seed gives the same numbers on
//! every platform.

use super::det;

/// SplitMix64: one step of the sequence that seeds xoshiro, and a good
/// mixer of a seed with a stream number.
pub fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

/// A stream seed from a seed and a list of labels (an issue's number, a
/// day): each label is mixed in turn.
pub fn derive(seed: u64, labels: &[u64]) -> u64 {
    let mut s = seed;
    let mut out = splitmix64(&mut s);
    for &l in labels {
        let mut t = out ^ l.wrapping_mul(0xd6e8_feb8_6659_fd93);
        out = splitmix64(&mut t);
    }
    out
}

#[derive(Debug, Clone)]
pub struct Rng {
    s: [u64; 4],
}

impl Rng {
    pub fn new(seed: u64) -> Rng {
        let mut st = seed;
        let s = [
            splitmix64(&mut st),
            splitmix64(&mut st),
            splitmix64(&mut st),
            splitmix64(&mut st),
        ];
        Rng { s }
    }

    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }

    /// Uniform in [0, 1), 53 random bits.
    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Uniform in (0, 1): never exactly zero, for quantiles.
    pub fn open01(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64 + 0.5) * (1.0 / (1u64 << 53) as f64)
    }

    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.uniform()
    }

    /// Log-uniform between two positive bounds.
    pub fn log_range(&mut self, lo: f64, hi: f64) -> f64 {
        det::exp(self.range(det::ln(lo), det::ln(hi)))
    }

    /// An integer in `0..n` (n > 0), without modulo bias worth noting at
    /// these sizes (n is far below 2^32).
    pub fn below(&mut self, n: usize) -> usize {
        (((self.next_u64() >> 32) * n as u64) >> 32) as usize
    }

    pub fn chance(&mut self, p: f64) -> bool {
        self.uniform() < p
    }

    pub fn normal(&mut self) -> f64 {
        det::normal_quantile(self.open01())
    }

    pub fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[self.below(xs.len())]
    }

    /// An index drawn with the given weights.
    pub fn weighted(&mut self, weights: &[f64]) -> usize {
        let total: f64 = weights.iter().sum();
        let mut x = self.uniform() * total;
        for (i, w) in weights.iter().enumerate() {
            x -= w;
            if x < 0.0 {
                return i;
            }
        }
        weights.len() - 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sequence_is_fixed_by_the_seed() {
        let mut a = Rng::new(7);
        let mut b = Rng::new(7);
        let mut c = Rng::new(8);
        let xs: Vec<u64> = (0..8).map(|_| a.next_u64()).collect();
        assert_eq!(xs, (0..8).map(|_| b.next_u64()).collect::<Vec<_>>());
        assert_ne!(xs, (0..8).map(|_| c.next_u64()).collect::<Vec<_>>());
        // The first output for seed 0, pinned so a change to the generator
        // is seen.
        assert_eq!(Rng::new(0).next_u64(), 0x99ec_5f36_cb75_f2b4);
        assert_ne!(derive(1, &[2, 3]), derive(1, &[3, 2]));
    }

    #[test]
    fn uniform_draws_stay_in_range() {
        let mut r = Rng::new(1);
        for _ in 0..10_000 {
            let u = r.uniform();
            assert!((0.0..1.0).contains(&u));
            assert!(r.below(5) < 5);
        }
    }
}
