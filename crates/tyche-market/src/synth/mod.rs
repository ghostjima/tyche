//! A synthetic bond market: a universe of fictional issuers and issues,
//! priced by tyche-yield from the zero-coupon yield curve, and a trading
//! day per issue (sessions, an order book and a tape) on the crate's
//! order book; who may buy each issue ([`access`]), and what happens to a
//! holding of it ([`events`]).
//!
//! Everything is seeded and deterministic: the same seed and inputs give
//! the same universe and the same days on every platform, WebAssembly
//! included. Nothing here is market data: the issuers, codes, ratings,
//! prices, books and trades are invented, and the generator is
//! calibrated on aggregate figures only ([`calibration`]).
//!
//! ```
//! use tyche_market::synth::{self, inputs};
//!
//! let u = synth::generate(20261006, &inputs::fallback()).unwrap();
//! assert!((150..=300).contains(&u.issues.len()));
//! let day = synth::simulate(u.seed, 0, &u.issues[0], 0, None);
//! assert!(!day.prints.is_empty());
//! ```

pub mod access;
pub mod calibration;
pub mod day;
pub mod det;
pub mod events;
pub mod inputs;
pub mod json;
pub mod rng;
pub mod universe;

pub use access::{gate, Access, Gate, Reason};
pub use day::{simulate, Aggressor, Day, Print, Session, SessionKind, Snapshot};
pub use events::{holding_events, EventKind, HoldingEvent, Source};
pub use inputs::{Curve, Inputs};
pub use universe::{
    generate, CouponKind, InputError, Issuer, Liquidity, Offer, OfferKind, Outlook, Sector,
    Segment, SynthIssue, Universe, RATINGS,
};

/// The seed the app's universe is generated with.
pub const DEFAULT_SEED: u64 = 20_261_006;
