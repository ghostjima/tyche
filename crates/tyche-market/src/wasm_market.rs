//! JavaScript bindings (feature `wasm`) for the synthetic market: the app
//! builds the universe once, in a worker, and asks it for the issues, for
//! an issue's day, for who may buy each issue, for a holding's events, for
//! the placements by book-building and for a depth check against an
//! issue's book. Results cross the boundary as JSON text, parsed on
//! the other side; the shapes are those of [`crate::synth::json`].

use crate::depth::depth_check;
use crate::message::Side;
use crate::synth::{self, Curve, Inputs, Universe};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SynthMarket {
    universe: Universe,
}

#[wasm_bindgen]
impl SynthMarket {
    /// Generates the universe for a seed and the Bank of Russia figures
    /// of the valuation date. The error's message is a stable code:
    /// `invalid_date`, `invalid_curve` or `invalid_rate`.
    #[wasm_bindgen(constructor)]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        seed: f64,
        valuation_date: &str,
        key_rate_pct: f64,
        ruonia_pct: f64,
        inflation_pct: f64,
        terms_years: &[f64],
        yields_pct: &[f64],
    ) -> Result<SynthMarket, JsError> {
        let inputs = Inputs {
            valuation_date: valuation_date.into(),
            key_rate_pct,
            ruonia_pct,
            inflation_pct,
            curve: Curve {
                terms_years: terms_years.to_vec(),
                yields_pct: yields_pct.to_vec(),
            },
        };
        synth::generate(seed as u64, &inputs)
            .map(|universe| SynthMarket { universe })
            .map_err(|e| JsError::new(e.code()))
    }

    /// The figures [`crate::synth::inputs::fallback`] holds, as JSON.
    #[wasm_bindgen(js_name = fallbackInputs)]
    pub fn fallback_inputs() -> String {
        let i = synth::inputs::fallback();
        let u = Universe {
            seed: 0,
            inputs: i,
            issuers: Vec::new(),
            issues: Vec::new(),
        };
        synth::json::universe_json(&u)
    }

    /// The universe as JSON.
    #[wasm_bindgen(js_name = universeJson)]
    pub fn universe_json(&self) -> String {
        synth::json::universe_json(&self.universe)
    }

    /// The universe's digest, as sixteen hexadecimal digits.
    pub fn digest(&self) -> String {
        format!("{:016x}", synth::json::universe_digest(&self.universe))
    }

    /// Issue `index`'s day number `day` up to `until_ms` (milliseconds
    /// since midnight, Moscow time; a negative value runs the whole day),
    /// as JSON with the top `levels` of the book. An index past the end
    /// gives `null`.
    #[wasm_bindgen(js_name = dayJson)]
    pub fn day_json(&self, index: u32, day: u32, until_ms: f64, levels: u32) -> String {
        let Some(issue) = self.universe.issues.get(index as usize) else {
            return "null".into();
        };
        let until = if until_ms < 0.0 {
            None
        } else {
            Some(until_ms as u32)
        };
        let d = synth::simulate(self.universe.seed, index as usize, issue, day, until);
        synth::json::day_json(&d, levels as usize)
    }

    /// Who may buy each issue, as JSON (`synth::json::access_json`).
    #[wasm_bindgen(js_name = accessJson)]
    pub fn access_json(&self) -> String {
        synth::json::access_json(&self.universe)
    }

    /// The new issues placed by book-building around the valuation date,
    /// as JSON (`synth::json::placements_json`).
    #[wasm_bindgen(js_name = placementsJson)]
    pub fn placements_json(&self) -> String {
        synth::json::placements_json(&self.universe, &synth::placements(&self.universe))
    }

    /// The events of a holding of `bonds` bonds of issue `index`, as JSON
    /// (`synth::json::events_json`); `null` for an index past the end.
    #[wasm_bindgen(js_name = eventsJson)]
    pub fn events_json(&self, index: u32, bonds: f64) -> String {
        match synth::holding_events(&self.universe, index as usize, bonds) {
            Some(events) => synth::json::events_json(&events),
            None => "null".into(),
        }
    }

    /// A depth check of a limit order against issue `index`'s book on day
    /// `day` at `until_ms` (as `dayJson`): `side` "buy" or "sell",
    /// `bonds` ordered, `limit` in price units (0.0001 percent of face).
    /// JSON as `synth::json::depth_json`; `null` for an index past the end
    /// or an unknown side.
    #[wasm_bindgen(js_name = depthJson)]
    pub fn depth_json(
        &self,
        index: u32,
        day: u32,
        until_ms: f64,
        side: &str,
        bonds: f64,
        limit: f64,
    ) -> String {
        let Some(issue) = self.universe.issues.get(index as usize) else {
            return "null".into();
        };
        let side = match side {
            "buy" => Side::Buy,
            "sell" => Side::Sell,
            _ => return "null".into(),
        };
        let until = if until_ms < 0.0 {
            None
        } else {
            Some(until_ms as u32)
        };
        let d = synth::simulate(self.universe.seed, index as usize, issue, day, until);
        let check = depth_check(d.book.levels(), side, bonds.max(0.0) as u64, limit as i64);
        synth::json::depth_json(&check)
    }
}
