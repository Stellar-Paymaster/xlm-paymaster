//! Error types for paymaster-core operations.
//!
//! This module defines [`PaymasterError`], the unified error type used throughout
//! the crate. All public functions return `Result<T, PaymasterError>` rather than
//! panicking.

use thiserror::Error;

/// All errors that can occur in paymaster-core operations.
///
/// This enum covers every failure mode that can occur when building transactions,
/// signing payloads, or working with Stellar XDR data.
///
/// # Examples
///
/// ```
/// use paymaster_core::PaymasterError;
///
/// fn might_fail() -> Result<(), PaymasterError> {
///     // Returns PaymasterError::InvalidTransaction if validation fails
///     Err(PaymasterError::InvalidTransaction("missing source account".to_string()))
/// }
/// ```
#[derive(Debug, Error)]
pub enum PaymasterError {
    /// The transaction could not be built due to missing or invalid fields.
    ///
    /// This error is returned when:
    /// - Required fields like source account or sequence number are missing
    /// - The transaction XDR is malformed
    /// - Operation arguments are invalid
    #[error("invalid transaction: {0}")]
    InvalidTransaction(String),

    /// Signing failed — the credential was rejected or unavailable.
    ///
    /// This error is returned when:
    /// - The secret key is invalid or malformed
    /// - The signing backend rejected the request
    /// - The signature hint doesn't match the transaction
    #[error("signing failed: {0}")]
    SigningFailed(String),

    /// The provided secret key is invalid or malformed.
    ///
    /// This error is returned when:
    /// - The secret key string is not valid Stellar strkey format
    /// - The key type is not Ed25519 private key
    #[error("invalid secret key: {0}")]
    InvalidSecret(String),

    /// The XDR data could not be parsed or is malformed.
    ///
    /// This error is returned when:
    /// - Transaction XDR cannot be decoded
    /// - The XDR version is incompatible
    /// - Binary data is corrupted
    #[error("XDR error: {0}")]
    Xdr(String),

    /// The transaction is already a fee-bump transaction.
    ///
    /// Fee-bump transactions cannot be wrapped in another fee-bump.
    /// This error is returned when attempting to fee-bump an already
    /// fee-bumped transaction.
    #[error("cannot fee-bump an already fee-bumped transaction")]
    AlreadyFeeBumped,

    /// The inner transaction is not signed.
    ///
    /// The inner transaction must be signed by at least one signer before
    /// a fee-bump transaction can wrap it.
    #[error("inner transaction must be signed before fee-bumping")]
    UnsignedTransaction,

    /// A fee payer account could not be found or is invalid.
    ///
    /// This error is returned when:
    /// - No fee payer accounts are configured
    /// - The fee payer secret is invalid
    #[error("fee payer error: {0}")]
    FeePayer(String),

    /// Network-related errors.
    ///
    /// This error is returned when:
    /// - Submitting a transaction to Horizon fails
    /// - Network operations time out
    /// - The network passphrase doesn't match
    #[error("network error: {0}")]
    Network(String),
}

impl PaymasterError {
    /// Create an invalid transaction error with a message.
    ///
    /// # Arguments
    ///
    /// * `msg` - The error message describing what was invalid
    ///
    /// # Examples
    ///
    /// ```
    /// use paymaster_core::PaymasterError;
    ///
    /// let err = PaymasterError::invalid_tx("missing sequence number");
    /// assert!(matches!(err, PaymasterError::InvalidTransaction(_)));
    /// ```
    pub fn invalid_tx<S: Into<String>>(msg: S) -> Self {
        Self::InvalidTransaction(msg.into())
    }

    /// Create a signing failed error with a message.
    ///
    /// # Arguments
    ///
    /// * `msg` - The error message describing why signing failed
    pub fn signing_failed<S: Into<String>>(msg: S) -> Self {
        Self::SigningFailed(msg.into())
    }

    /// Create an XDR error with a message.
    ///
    /// # Arguments
    ///
    /// * `msg` - The error message describing the XDR issue
    pub fn xdr<S: Into<String>>(msg: S) -> Self {
        Self::Xdr(msg.into())
    }
}
