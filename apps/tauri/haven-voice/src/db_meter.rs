//! Minimal replacement for the example's db_meter module — the audio helper
//! modules only need `calculate_db_level`; we drop the terminal visualiser.

/// RMS level of a mono i16 buffer, in dBFS (floored at -60).
pub fn calculate_db_level(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return -60.0;
    }
    let sum_sq: f64 = samples
        .iter()
        .map(|&s| {
            let f = s as f64 / i16::MAX as f64;
            f * f
        })
        .sum();
    let rms = (sum_sq / samples.len() as f64).sqrt();
    if rms <= 0.0 {
        -60.0
    } else {
        ((20.0 * rms.log10()) as f32).max(-60.0)
    }
}
