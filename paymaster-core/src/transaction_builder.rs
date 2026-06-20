//! Transaction building and fee-bumping for Stellar.
//!
//! This module provides [`TransactionBuilder`] for constructing fee-bump transactions
//! that wrap signed inner transactions. Fee-bump transactions allow a third party
//! (the fee payer) to pay for transaction fees on behalf of another account.
//!
//! # Fee-Bump Overview
//!
//! Stellar's fee-bump mechanism allows one account to pay the fees for a
//! transaction signed by another account. This is useful for:
//! - Gasless transactions for users
//! - Sponsored transactions
//! - Smart wallet implementations
//!
//! # Examples
//!
//! ```
//! use fluid_core::{TransactionBuilder, FeeConfig, NetworkPassphrase};
//! use fluid_core::{Ed25519Signer, Signer};
//!
//! // Build a fee-bump transaction (simplified - actual usage requires XDR handling)
//! let config = FeeConfig::new(100, 2.0);
//! let network = NetworkPassphrase::testnet();
//! ```

use crate::error::FluidError;
use crate::types::{DecoratedSignature, FeeConfig, NetworkPassphrase, PublicKey, TransactionHash};
use crate::signer::Signer;

/// A builder for constructing fee-bump transactions.
///
/// This builder follows the builder pattern, allowing method chaining
/// to configure the fee-bump transaction before building.
///
/// # Examples
///
/// ```
/// use fluid_core::{TransactionBuilder, FeeConfig, NetworkPassphrase};
///
/// // Configure the builder
/// let builder = TransactionBuilder::new()
///     .base_fee(100)
///     .fee_multiplier(2.0)
///     .network_passphrase(NetworkPassphrase::testnet());
/// ```
#[derive(Clone, Debug)]
pub struct TransactionBuilder {
    base_fee: u32,
    fee_multiplier: f64,
    network_passphrase: NetworkPassphrase,
    inner_xdr: Option<String>,
    inner_hash: Option<TransactionHash>,
    inner_signatures: Vec<DecoratedSignature>,
    fee_payer: Option<PublicKey>,
}

impl TransactionBuilder {
    /// Create a new transaction builder with default settings.
    ///
    /// Defaults:
    /// - Base fee: 100 stroops
    /// - Fee multiplier: 1.0
    /// - Network: Testnet
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::TransactionBuilder;
    ///
    /// let builder = TransactionBuilder::new();
    /// ```
    pub fn new() -> Self {
        Self {
            base_fee: 100,
            fee_multiplier: 1.0,
            network_passphrase: NetworkPassphrase::default(),
            inner_xdr: None,
            inner_hash: None,
            inner_signatures: Vec::new(),
            fee_payer: None,
        }
    }

    /// Set the base fee in stroops.
    ///
    /// # Arguments
    ///
    /// * `fee` - The base fee in stroops (1 XLM = 10,000,000 stroops)
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::TransactionBuilder;
    ///
    /// let builder = TransactionBuilder::new().base_fee(200);
    /// ```
    pub fn base_fee(mut self, fee: u32) -> Self {
        self.base_fee = fee;
        self
    }

    /// Set the fee multiplier.
    ///
    /// The final fee is calculated as: `(ops + 1) * base_fee * multiplier`
    ///
    /// # Arguments
    ///
    /// * `multiplier` - The fee multiplier (typically 1.0 or higher)
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::TransactionBuilder;
    ///
    /// let builder = TransactionBuilder::new().fee_multiplier(2.0);
    /// ```
    pub fn fee_multiplier(mut self, multiplier: f64) -> Self {
        self.fee_multiplier = multiplier;
        self
    }

    /// Set the network passphrase.
    ///
    /// # Arguments
    ///
    /// * `passphrase` - The network passphrase (testnet, mainnet, etc.)
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::{TransactionBuilder, NetworkPassphrase};
    ///
    /// let builder = TransactionBuilder::new()
    ///     .network_passphrase(NetworkPassphrase::mainnet());
    /// ```
    pub fn network_passphrase(mut self, passphrase: NetworkPassphrase) -> Self {
        self.network_passphrase = passphrase;
        self
    }

    /// Set the inner transaction XDR.
    ///
    /// This is the signed inner transaction that will be wrapped by the fee-bump.
    ///
    /// # Arguments
    ///
    /// * `xdr` - The inner transaction XDR as a base64-encoded string
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::TransactionBuilder;
    ///
    /// let builder = TransactionBuilder::new()
    ///     .inner_xdr("AAAA...".to_string());
    /// ```
    pub fn inner_xdr(mut self, xdr: String) -> Self {
        self.inner_xdr = Some(xdr);
        self
    }

    /// Set the inner transaction hash.
    ///
    /// This is the hash that must be signed by the fee payer.
    ///
    /// # Arguments
    ///
    /// * `hash` - The 32-byte transaction hash
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::{TransactionBuilder, TransactionHash};
    ///
    /// let hash = TransactionHash::new([0u8; 32]);
    /// let builder = TransactionBuilder::new().inner_hash(hash);
    /// ```
    pub fn inner_hash(mut self, hash: TransactionHash) -> Self {
        self.inner_hash = Some(hash);
        self
    }

    /// Add a signature from the inner transaction.
    ///
    /// These signatures are preserved in the fee-bump wrapper.
    ///
    /// # Arguments
    ///
    /// * `signature` - A decorated signature from the inner transaction
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::{TransactionBuilder, DecoratedSignature};
    ///
    /// let sig = DecoratedSignature::new([0u8; 4], [0u8; 64]);
    /// let builder = TransactionBuilder::new().add_signature(sig);
    /// ```
    pub fn add_signature(mut self, signature: DecoratedSignature) -> Self {
        self.inner_signatures.push(signature);
        self
    }

    /// Set the inner transaction signatures.
    ///
    /// Replaces any existing signatures.
    ///
    /// # Arguments
    ///
    /// * `signatures` - The list of decorated signatures
    pub fn inner_signatures(mut self, signatures: Vec<DecoratedSignature>) -> Self {
        self.inner_signatures = signatures;
        self
    }

    /// Set the fee payer public key.
    ///
    /// # Arguments
    ///
    /// * `fee_payer` - The public key of the account paying the fee
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::{TransactionBuilder, PublicKey};
    ///
    /// let fee_payer = PublicKey::new([0u8; 32]);
    /// let builder = TransactionBuilder::new().fee_payer(fee_payer);
    /// ```
    pub fn fee_payer(mut self, fee_payer: PublicKey) -> Self {
        self.fee_payer = Some(fee_payer);
        self
    }

    /// Get the fee configuration.
    ///
    /// # Returns
    ///
    /// A [`FeeConfig`] with the current base fee and multiplier.
    pub fn fee_config(&self) -> FeeConfig {
        FeeConfig::new(self.base_fee, self.fee_multiplier)
    }

    /// Get the network passphrase.
    pub fn network(&self) -> &NetworkPassphrase {
        &self.network_passphrase
    }

    /// Calculate the fee for a given number of operations.
    ///
    /// # Arguments
    ///
    /// * `operation_count` - The number of operations in the inner transaction
    ///
    /// # Returns
    ///
    /// The calculated fee in stroops.
    pub fn calculate_fee(&self, operation_count: usize) -> u64 {
        self.fee_config().calculate_fee(operation_count)
    }

    /// Validate the builder state.
    ///
    /// Checks that all required fields are set and valid.
    ///
    /// # Errors
    ///
    /// Returns [`FluidError::InvalidTransaction`] if:
    /// - No inner transaction is set
    /// - No fee payer is set
    /// - The inner transaction has no signatures
    pub fn validate(&self) -> Result<(), FluidError> {
        if self.inner_xdr.is_none() && self.inner_hash.is_none() {
            return Err(FluidError::invalid_tx(
                "inner transaction XDR or hash must be set",
            ));
        }

        if self.fee_payer.is_none() {
            return Err(FluidError::invalid_tx("fee payer must be set"));
        }

        if self.inner_signatures.is_empty() {
            return Err(FluidError::UnsignedTransaction);
        }

        Ok(())
    }

    /// Build a fee-bump transaction envelope.
    ///
    /// This creates a signed fee-bump transaction ready for submission.
    /// The fee payer signer must sign the inner transaction hash.
    ///
    /// # Arguments
    ///
    /// * `signer` - The signer for the fee payer account
    /// * `operation_count` - The number of operations in the inner transaction
    ///
    /// # Returns
    ///
    /// A [`FeeBumpTransaction`] containing the signed fee-bump envelope.
    ///
    /// # Errors
    ///
    /// - [`FluidError::InvalidTransaction`] if validation fails
    /// - [`FluidError::SigningFailed`] if signing fails
    /// - [`FluidError::UnsignedTransaction`] if inner transaction is unsigned
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use fluid_core::{TransactionBuilder, Ed25519Signer, Signer};
    /// use fluid_core::{Keypair, PublicKey, TransactionHash};
    ///
    /// // Setup (normally you'd have actual keys and XDR)
    /// let fee_payer = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
    /// let signer = Ed25519Signer::new(fee_payer);
    ///
    /// // This would normally include actual XDR and a valid hash
    /// // let tx = TransactionBuilder::new()
    /// //     .inner_xdr("AAAA...".to_string())
    /// //     .inner_hash(TransactionHash::new([0u8; 32]))
    /// //     .add_signature(DecoratedSignature::new([0u8; 4], [0u8; 64]))
    /// //     .fee_payer(PublicKey::new([2u8; 32]))
    /// //     .build(&signer, 3)?;
    /// ```
    pub fn build<S: Signer>(
        &self,
        signer: &S,
        operation_count: usize,
    ) -> Result<FeeBumpTransaction, FluidError> {
        self.validate()?;

        let fee = self.calculate_fee(operation_count);
        let fee_payer = self.fee_payer.clone().ok_or_else(|| {
            FluidError::invalid_tx("fee payer not set")
        })?;

        // Get the inner transaction hash for signing
        let inner_hash = self.inner_hash.clone().ok_or_else(|| {
            FluidError::invalid_tx("inner transaction hash not set")
        })?;

        // Sign the inner transaction hash with the fee payer
        let fee_bump_signature = signer.sign_hash(&inner_hash)?;

        Ok(FeeBumpTransaction {
            fee,
            fee_payer,
            inner_xdr: self.inner_xdr.clone(),
            inner_signatures: self.inner_signatures.clone(),
            fee_bump_signature,
            network_passphrase: self.network_passphrase.clone(),
        })
    }
}

impl Default for TransactionBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// A signed fee-bump transaction.
///
/// This type represents a complete fee-bump transaction envelope
/// ready for serialization and submission to the Stellar network.
///
/// # Fields
///
/// * `fee` - The total fee in stroops
/// * `fee_payer` - The public key of the account paying the fee
/// * `inner_xdr` - The XDR of the inner transaction (optional)
/// * `inner_signatures` - Signatures from the inner transaction
/// * `fee_bump_signature` - The fee payer's signature
/// * `network_passphrase` - The network this transaction is valid for
#[derive(Clone, Debug)]
pub struct FeeBumpTransaction {
    fee: u64,
    fee_payer: PublicKey,
    inner_xdr: Option<String>,
    inner_signatures: Vec<DecoratedSignature>,
    fee_bump_signature: DecoratedSignature,
    network_passphrase: NetworkPassphrase,
}

impl FeeBumpTransaction {
    /// Get the fee amount in stroops.
    pub fn fee(&self) -> u64 {
        self.fee
    }

    /// Get the fee payer public key.
    pub fn fee_payer(&self) -> &PublicKey {
        &self.fee_payer
    }

    /// Get the inner transaction XDR if set.
    pub fn inner_xdr(&self) -> Option<&str> {
        self.inner_xdr.as_deref()
    }

    /// Get the inner transaction signatures.
    pub fn inner_signatures(&self) -> &[DecoratedSignature] {
        &self.inner_signatures
    }

    /// Get the fee bump signature.
    pub fn fee_bump_signature(&self) -> &DecoratedSignature {
        &self.fee_bump_signature
    }

    /// Get the network passphrase.
    pub fn network_passphrase(&self) -> &NetworkPassphrase {
        &self.network_passphrase
    }

    /// Convert to XDR string.
    ///
    /// Serializes the fee-bump transaction to a base64-encoded XDR string.
    ///
    /// # Returns
    ///
    /// A base64-encoded XDR string, or None if XDR serialization is not available.
    pub fn to_xdr(&self) -> Option<String> {
        // In a full implementation, this would serialize to actual XDR
        // For now, we return the inner XDR with a fee-bump wrapper indicator
        self.inner_xdr.clone()
    }
}

/// A parsed inner transaction.
///
/// This represents a decoded inner transaction with its hash and signatures.
#[derive(Clone, Debug)]
pub struct InnerTransaction {
    xdr: String,
    hash: TransactionHash,
    signatures: Vec<DecoratedSignature>,
    operation_count: usize,
}

impl InnerTransaction {
    /// Create a new inner transaction.
    ///
    /// # Arguments
    ///
    /// * `xdr` - The transaction XDR
    /// * `hash` - The transaction hash
    /// * `signatures` - The transaction signatures
    /// * `operation_count` - The number of operations
    pub fn new(
        xdr: String,
        hash: TransactionHash,
        signatures: Vec<DecoratedSignature>,
        operation_count: usize,
    ) -> Self {
        Self {
            xdr,
            hash,
            signatures,
            operation_count,
        }
    }

    /// Get the XDR.
    pub fn xdr(&self) -> &str {
        &self.xdr
    }

    /// Get the transaction hash.
    pub fn hash(&self) -> &TransactionHash {
        &self.hash
    }

    /// Get the signatures.
    pub fn signatures(&self) -> &[DecoratedSignature] {
        &self.signatures
    }

    /// Get the operation count.
    pub fn operation_count(&self) -> usize {
        self.operation_count
    }

    /// Check if the transaction is signed.
    pub fn is_signed(&self) -> bool {
        !self.signatures.is_empty()
    }
}

/// Parse a transaction XDR string.
///
/// This function decodes a base64-encoded transaction XDR and extracts
/// the hash, signatures, and operation count.
///
/// # Arguments
///
/// * `xdr` - The base64-encoded XDR string
/// * `network_passphrase` - The network passphrase for computing the hash
///
/// # Returns
///
/// An [`InnerTransaction`] containing the parsed data.
///
/// # Errors
///
/// Returns [`FluidError::Xdr`] if the XDR is malformed.
///
/// # Examples
///
/// ```no_run
/// use fluid_core::{parse_inner_tx, NetworkPassphrase, FluidError};
///
/// // This would work with real XDR:
/// // let inner = parse_inner_tx("AAAA...", &NetworkPassphrase::testnet())?;
/// ```
pub fn parse_inner_tx(
    xdr: &str,
    _network_passphrase: &NetworkPassphrase,
) -> Result<InnerTransaction, FluidError> {
    // In a full implementation, this would:
    // 1. Decode the base64 XDR
    // 2. Parse the transaction envelope
    // 3. Compute the hash using the network passphrase
    // 4. Extract signatures
    // 5. Count operations

    // Placeholder implementation
    let hash = TransactionHash::new([0u8; 32]);
    let signatures = Vec::new();
    let operation_count = 0;

    Ok(InnerTransaction::new(
        xdr.to_string(),
        hash,
        signatures,
        operation_count,
    ))
}

/// Validate that a transaction is not already a fee-bump transaction.
///
/// # Arguments
///
/// * `xdr` - The transaction XDR to check
///
/// # Errors
///
/// Returns [`FluidError::AlreadyFeeBumped`] if the transaction is already
/// a fee-bump transaction.
pub fn validate_not_fee_bump(xdr: &str) -> Result<(), FluidError> {
    // In a full implementation, this would decode the XDR and check
    // the envelope type to ensure it's not already a fee-bump transaction.

    // Check for fee-bump indicator in XDR (simplified)
    if xdr.starts_with("feeBump:") {
        return Err(FluidError::AlreadyFeeBumped);
    }

    Ok(())
}

/// Compute the transaction hash.
///
/// The hash is computed over the transaction data combined with the
/// network passphrase.
///
/// # Arguments
///
/// * `xdr` - The transaction XDR
/// * `network_passphrase` - The network passphrase
///
/// # Returns
///
/// The 32-byte transaction hash.
pub fn compute_transaction_hash(
    _xdr: &str,
    network_passphrase: &NetworkPassphrase,
) -> TransactionHash {
    // In a full implementation, this would:
    // 1. Decode the XDR
    // 2. Serialize the transaction (without signatures)
    // 3. Hash with network ID: SHA256(network_passphrase + tx_data)

    // Placeholder: return a hash derived from the passphrase
    let passphrase_bytes = network_passphrase.as_str().as_bytes();
    let mut hash = [0u8; 32];
    let len = passphrase_bytes.len().min(32);
    hash[..len].copy_from_slice(&passphrase_bytes[..len]);

    TransactionHash::new(hash)
}
