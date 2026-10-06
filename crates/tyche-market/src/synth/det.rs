//! Transcendental functions from the four basic operations only.
//!
//! `f64::exp` and `f64::ln` call the platform's maths library, whose last
//! bit differs between Linux, macOS, Windows and WebAssembly. The
//! generator draws thousands of numbers through them, and a one-bit
//! difference can move a rounded price by a tick, so the same seed would
//! not give the same universe everywhere. These versions use only
//! addition, multiplication and division, which IEEE 754 rounds the same
//! on every platform, in a fixed order. Accuracy is about 1e-15 relative,
//! far below anything the generator rounds to.

use std::f64::consts::LN_2;

/// ln 2 split in two (as in fdlibm): the high part has its low bits zero,
/// so a multiple of it by an exponent is exact.
const LN2_HI: f64 = f64::from_bits(0x3fe6_2e42_fee0_0000);
const LN2_LO: f64 = f64::from_bits(0x3dea_39ef_3579_3c76);

/// `x * 2^k` for `k` in the normal exponent range, exactly.
fn scale2(x: f64, k: i64) -> f64 {
    let mut x = x;
    let mut k = k;
    // Two steps keep each factor a normal number.
    while k > 1000 {
        x *= f64::from_bits(((1000 + 1023) as u64) << 52);
        k -= 1000;
    }
    while k < -1000 {
        x *= f64::from_bits(((-1000 + 1023) as u64) << 52);
        k += 1000;
    }
    x * f64::from_bits(((k + 1023) as u64) << 52)
}

/// e^x. NaN for NaN; 0 below -745 and infinity above 709.
pub fn exp(x: f64) -> f64 {
    if x.is_nan() {
        return f64::NAN;
    }
    if x > 709.0 {
        return f64::INFINITY;
    }
    if x < -745.0 {
        return 0.0;
    }
    // x = k ln 2 + r with |r| <= ln 2 / 2; the series for e^r converges
    // to double precision in 18 terms.
    let k = (x / LN_2 + if x < 0.0 { -0.5 } else { 0.5 }) as i64;
    let r = (x - k as f64 * LN2_HI) - k as f64 * LN2_LO;
    let mut term = 1.0;
    let mut sum = 1.0;
    for n in 1..=18 {
        term = term * r / n as f64;
        sum += term;
    }
    scale2(sum, k)
}

/// The natural logarithm. NaN for NaN or a negative number, -infinity at
/// zero.
pub fn ln(x: f64) -> f64 {
    if x.is_nan() || x < 0.0 {
        return f64::NAN;
    }
    if x == 0.0 {
        return f64::NEG_INFINITY;
    }
    if x.is_infinite() {
        return f64::INFINITY;
    }
    // x = m * 2^e with m in [sqrt(1/2), sqrt(2)); subnormals are scaled
    // into the normal range first.
    let (mut x, mut e) = (x, 0i64);
    if x < f64::MIN_POSITIVE {
        x *= f64::from_bits(((54 + 1023) as u64) << 52);
        e -= 54;
    }
    let bits = x.to_bits();
    e += ((bits >> 52) & 0x7ff) as i64 - 1023;
    let mut m = f64::from_bits((bits & 0x000f_ffff_ffff_ffff) | (1023u64 << 52));
    if m > std::f64::consts::SQRT_2 {
        m *= 0.5;
        e += 1;
    }
    // ln m = 2 atanh(s), s = (m - 1) / (m + 1), |s| < 0.172: the odd
    // series to s^41 is below double precision.
    let s = (m - 1.0) / (m + 1.0);
    let s2 = s * s;
    let mut power = s;
    let mut sum = 0.0;
    let mut n = 1.0;
    while n <= 41.0 {
        sum += power / n;
        power *= s2;
        n += 2.0;
    }
    e as f64 * LN2_HI + (e as f64 * LN2_LO + 2.0 * sum)
}

/// The standard normal quantile (the inverse of its distribution
/// function), by P. J. Acklam's rational approximation, relative error
/// below 1.2e-9. `p` outside (0, 1) gives NaN.
pub fn normal_quantile(p: f64) -> f64 {
    if !(p > 0.0 && p < 1.0) {
        return f64::NAN;
    }
    const A: [f64; 6] = [
        -3.969_683_028_665_376e1,
        2.209_460_984_245_205e2,
        -2.759_285_104_469_687e2,
        1.383_577_518_672_69e2,
        -3.066_479_806_614_716e1,
        2.506_628_277_459_239,
    ];
    const B: [f64; 5] = [
        -5.447_609_879_822_406e1,
        1.615_858_368_580_409e2,
        -1.556_989_798_598_866e2,
        6.680_131_188_771_972e1,
        -1.328_068_155_288_572e1,
    ];
    const C: [f64; 6] = [
        -7.784_894_002_430_293e-3,
        -3.223_964_580_411_365e-1,
        -2.400_758_277_161_838,
        -2.549_732_539_343_734,
        4.374_664_141_464_968,
        2.938_163_982_698_783,
    ];
    const D: [f64; 4] = [
        7.784_695_709_041_462e-3,
        3.224_671_290_700_398e-1,
        2.445_134_137_142_996,
        3.754_408_661_907_416,
    ];
    const LOW: f64 = 0.024_25;
    let tail = |q: f64| {
        (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
            / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0)
    };
    if p < LOW {
        tail((-2.0 * ln(p)).sqrt())
    } else if p > 1.0 - LOW {
        -tail((-2.0 * ln(1.0 - p)).sqrt())
    } else {
        let q = p - 0.5;
        let r = q * q;
        (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q
            / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rel(a: f64, b: f64) -> f64 {
        ((a - b) / b).abs()
    }

    #[test]
    fn exp_and_ln_agree_with_the_platform_to_double_precision() {
        let mut x = -700.0;
        while x < 700.0 {
            assert!(rel(exp(x), x.exp()) < 4e-15, "exp({x})");
            x += 0.7371;
        }
        for &x in &[
            1e-310, 1e-300, 1e-12, 0.1, 0.5, 0.999, 1.0, 1.5, 2.0, 3.0, 1e6, 1e300,
        ] {
            let a = ln(x);
            let b = x.ln();
            assert!(
                (a - b).abs() <= 4e-15 * b.abs().max(1.0),
                "ln({x}): {a} vs {b}"
            );
        }
        assert_eq!(ln(1.0), 0.0);
        assert_eq!(exp(0.0), 1.0);
        assert!(ln(-1.0).is_nan() && exp(f64::NAN).is_nan());
    }

    #[test]
    fn the_normal_quantile_matches_known_values() {
        assert_eq!(normal_quantile(0.5), 0.0);
        assert!((normal_quantile(0.9) - 1.281_551_565_545).abs() < 1e-8);
        assert!((normal_quantile(0.975) - 1.959_963_984_540).abs() < 1e-8);
        assert!((normal_quantile(0.001) + 3.090_232_306_168).abs() < 1e-8);
        assert!(normal_quantile(0.0).is_nan() && normal_quantile(1.0).is_nan());
    }
}
