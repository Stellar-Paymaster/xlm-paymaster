/// Congestion Fee Calculator Module (Issue #712)
///
/// Decouples the fee calculation engine from the core API server so it can be
/// updated, tested, and reasoned about independently.
///
/// The module exposes a pure `calculate_fee` function plus a `FeeCalculator`
/// struct that can be configured and reused across the signing pipeline.
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Input parameters for a fee calculation.
#[derive(Clone, Debug, PartialEq)]
pub struct FeeInput {
    /// Base fee per operation in stroops (e.g. 100).
    pub base_fee: i64,
    /// Multiplier applied to the raw fee (e.g. 2.0 for high congestion).
    pub multiplier: f64,
    /// Number of operations in the inner transaction.
    pub operation_count: usize,
}

/// Result of a fee calculation.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FeeResult {
    /// Per-operation fee after applying the multiplier (stroops).
    pub per_op_fee: i64,
    /// Total fee for the fee-bump envelope (stroops).
    /// This is `per_op_fee * (operation_count + 1)` — the +1 accounts for the
    /// fee-bump operation itself.
    pub total_fee: i64,
    /// Congestion level inferred from the multiplier.
    pub congestion_level: CongestionLevel,
}

/// Congestion level classification.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CongestionLevel {
    Low,
    Medium,
    High,
}

impl CongestionLevel {
    /// Classify a multiplier into a congestion level.
    ///
    /// - `< 1.5`  → Low
    /// - `1.5..3` → Medium
    /// - `>= 3`   → High
    pub fn from_multiplier(multiplier: f64) -> Self {
        if multiplier < 1.5 {
            Self::Low
        } else if multiplier < 3.0 {
            Self::Medium
        } else {
            Self::High
        }
    }
}

// ---------------------------------------------------------------------------
// Pure calculation function
// ---------------------------------------------------------------------------

/// Calculate the fee-bump fee for a given set of inputs.
///
/// Returns an error string when inputs are invalid (e.g. non-positive base fee
/// or negative operation count).
pub fn calculate_fee(input: &FeeInput) -> Result<FeeResult, String> {
    if input.base_fee <= 0 {
        return Err(format!("base_fee must be positive, got {}", input.base_fee));
    }
    if !input.multiplier.is_finite() || input.multiplier <= 0.0 {
        return Err(format!(
            "multiplier must be a positive finite number, got {}",
            input.multiplier
        ));
    }

    let op_count = input.operation_count as i64;
    // Per-operation fee: ceil(base_fee * multiplier)
    let per_op_fee = (input.base_fee as f64 * input.multiplier).ceil() as i64;
    // Total fee covers all inner ops + the fee-bump op itself
    let total_fee = per_op_fee * (op_count + 1);

    Ok(FeeResult {
        per_op_fee,
        total_fee,
        congestion_level: CongestionLevel::from_multiplier(input.multiplier),
    })
}

// ---------------------------------------------------------------------------
// Stateful calculator (wraps config for reuse)
// ---------------------------------------------------------------------------

/// A reusable fee calculator that holds base configuration.
#[derive(Clone, Debug)]
pub struct FeeCalculator {
    base_fee: i64,
    multiplier: f64,
}

impl FeeCalculator {
    /// Create a new calculator.
    ///
    /// # Panics
    /// Panics in debug builds if `base_fee <= 0` or `multiplier <= 0`.
    pub fn new(base_fee: i64, multiplier: f64) -> Self {
        debug_assert!(base_fee > 0, "base_fee must be positive");
        debug_assert!(multiplier > 0.0, "multiplier must be positive");
        Self {
            base_fee,
            multiplier,
        }
    }

    /// Update the multiplier (e.g. after a congestion poll).
    pub fn set_multiplier(&mut self, multiplier: f64) {
        self.multiplier = multiplier;
    }

    /// Calculate the fee for a transaction with `operation_count` operations.
    pub fn calculate(&self, operation_count: usize) -> Result<FeeResult, String> {
        calculate_fee(&FeeInput {
            base_fee: self.base_fee,
            multiplier: self.multiplier,
            operation_count,
        })
    }

    pub fn base_fee(&self) -> i64 {
        self.base_fee
    }

    pub fn multiplier(&self) -> f64 {
        self.multiplier
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_fee_calculation() {
        let result = calculate_fee(&FeeInput {
            base_fee: 100,
            multiplier: 2.0,
            operation_count: 1,
        })
        .unwrap();

        // per_op_fee = ceil(100 * 2.0) = 200
        // total_fee  = 200 * (1 + 1) = 400
        assert_eq!(result.per_op_fee, 200);
        assert_eq!(result.total_fee, 400);
        assert_eq!(result.congestion_level, CongestionLevel::Medium);
    }

    #[test]
    fn fee_calculation_with_multiple_operations() {
        let result = calculate_fee(&FeeInput {
            base_fee: 100,
            multiplier: 1.0,
            operation_count: 5,
        })
        .unwrap();

        assert_eq!(result.per_op_fee, 100);
        assert_eq!(result.total_fee, 600); // 100 * (5 + 1)
        assert_eq!(result.congestion_level, CongestionLevel::Low);
    }

    #[test]
    fn fee_calculation_rounds_up() {
        // 100 * 1.5 = 150.0 exactly → no rounding needed
        let result = calculate_fee(&FeeInput {
            base_fee: 100,
            multiplier: 1.5,
            operation_count: 1,
        })
        .unwrap();
        assert_eq!(result.per_op_fee, 150);

        // 100 * 1.333 = 133.3 → ceil → 134
        let result2 = calculate_fee(&FeeInput {
            base_fee: 100,
            multiplier: 1.333,
            operation_count: 1,
        })
        .unwrap();
        assert_eq!(result2.per_op_fee, 134);
    }

    #[test]
    fn rejects_non_positive_base_fee() {
        assert!(calculate_fee(&FeeInput {
            base_fee: 0,
            multiplier: 1.0,
            operation_count: 1,
        })
        .is_err());

        assert!(calculate_fee(&FeeInput {
            base_fee: -1,
            multiplier: 1.0,
            operation_count: 1,
        })
        .is_err());
    }

    #[test]
    fn rejects_invalid_multiplier() {
        assert!(calculate_fee(&FeeInput {
            base_fee: 100,
            multiplier: 0.0,
            operation_count: 1,
        })
        .is_err());

        assert!(calculate_fee(&FeeInput {
            base_fee: 100,
            multiplier: f64::NAN,
            operation_count: 1,
        })
        .is_err());

        assert!(calculate_fee(&FeeInput {
            base_fee: 100,
            multiplier: f64::INFINITY,
            operation_count: 1,
        })
        .is_err());
    }

    #[test]
    fn zero_operations_still_charges_fee_bump_op() {
        let result = calculate_fee(&FeeInput {
            base_fee: 100,
            multiplier: 2.0,
            operation_count: 0,
        })
        .unwrap();
        // total = 200 * (0 + 1) = 200
        assert_eq!(result.total_fee, 200);
    }

    #[test]
    fn congestion_level_classification() {
        assert_eq!(CongestionLevel::from_multiplier(1.0), CongestionLevel::Low);
        assert_eq!(CongestionLevel::from_multiplier(1.49), CongestionLevel::Low);
        assert_eq!(
            CongestionLevel::from_multiplier(1.5),
            CongestionLevel::Medium
        );
        assert_eq!(
            CongestionLevel::from_multiplier(2.9),
            CongestionLevel::Medium
        );
        assert_eq!(CongestionLevel::from_multiplier(3.0), CongestionLevel::High);
        assert_eq!(
            CongestionLevel::from_multiplier(10.0),
            CongestionLevel::High
        );
    }

    #[test]
    fn fee_calculator_struct() {
        let mut calc = FeeCalculator::new(100, 2.0);
        let result = calc.calculate(3).unwrap();
        assert_eq!(result.per_op_fee, 200);
        assert_eq!(result.total_fee, 800); // 200 * (3 + 1)

        calc.set_multiplier(1.0);
        let result2 = calc.calculate(3).unwrap();
        assert_eq!(result2.per_op_fee, 100);
        assert_eq!(result2.total_fee, 400);
    }

    #[test]
    fn fee_result_is_serializable() {
        let result = FeeResult {
            per_op_fee: 200,
            total_fee: 400,
            congestion_level: CongestionLevel::Medium,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"congestion_level\":\"medium\""));
    }
}
