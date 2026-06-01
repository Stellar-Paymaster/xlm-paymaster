//! Shared types for fluid-core operations.
//!
//! This module defines types used throughout the crate for representing
//! Stellar accounts, keys, transactions, and fee-bump configuration.

use zeroize::Zeroizing;

/// A Stellar Ed25519 public key.
///
/// This type wraps a 32-byte public key used for identifying accounts
/// on the Stellar network.
///
/// # Examples
///
/// ```
/// use fluid_core::PublicKey;
///
/// // Create from bytes
/// let bytes = [0u8; 32];
/// let pk = PublicKey::new(bytes);
/// ```
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct PublicKey([u8; 32]);

impl PublicKey {
    /// Create a new public key from raw bytes.
    ///
    /// # Arguments
    ///
    /// * `bytes` - The 32-byte Ed25519 public key
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::PublicKey;
    ///
    /// let bytes = [1u8; 32];
    /// let pk = PublicKey::new(bytes);
    /// ```
    pub fn new(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Get the raw bytes of the public key.
    ///
    /// # Returns
    ///
    /// A 32-byte array containing the Ed25519 public key.
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Get the signature hint (last 4 bytes of the public key).
    ///
    /// Stellar uses the last 4 bytes of a public key as a signature hint
    /// to help identify which signer produced a signature.
    ///
    /// # Returns
    ///
    /// A 4-byte array containing the signature hint.
    pub fn signature_hint(&self) -> [u8; 4] {
        let mut hint = [0u8; 4];
        hint.copy_from_slice(&self.0[28..32]);
        hint
    }
}

impl AsRef<[u8]> for PublicKey {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// A Stellar Ed25519 secret key.
///
/// This type wraps a 32-byte secret key with automatic zeroization
/// when dropped to prevent key material from lingering in memory.
///
/// # Security
///
/// The secret key is stored in a [`Zeroizing`] wrapper that automatically
/// overwrites the memory with zeros when the key is dropped.
///
/// # Examples
///
/// ```
/// use fluid_core::SecretKey;
///
/// // Create from bytes
/// let bytes = [0u8; 32];
/// let sk = SecretKey::new(bytes);
/// ```
#[derive(Clone, Debug)]
pub struct SecretKey(Zeroizing<[u8; 32]>);

impl SecretKey {
    /// Create a new secret key from raw bytes.
    ///
    /// # Arguments
    ///
    /// * `bytes` - The 32-byte Ed25519 secret key
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::SecretKey;
    ///
    /// let bytes = [1u8; 32];
    /// let sk = SecretKey::new(bytes);
    /// ```
    pub fn new(bytes: [u8; 32]) -> Self {
        Self(Zeroizing::new(bytes))
    }

    /// Get the raw bytes of the secret key.
    ///
    /// # Returns
    ///
    /// A reference to the 32-byte Ed25519 secret key.
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl AsRef<[u8]> for SecretKey {
    fn as_ref(&self) -> &[u8] {
        self.0.as_ref()
    }
}

/// A Stellar keypair containing both public and secret keys.
///
/// This type is used for accounts that can sign transactions.
/// The secret key is automatically zeroized when the keypair is dropped.
///
/// # Examples
///
/// ```
/// use fluid_core::Keypair;
///
/// // Create from raw bytes
/// let secret = [1u8; 32];
/// let public = [2u8; 32];
/// let keypair = Keypair::from_raw_keys(secret, public);
/// ```
#[derive(Clone, Debug)]
pub struct Keypair {
    public: PublicKey,
    secret: SecretKey,
}

impl Keypair {
    /// Create a keypair from raw public and secret key bytes.
    ///
    /// # Arguments
    ///
    /// * `secret` - The 32-byte Ed25519 secret key
    /// * `public` - The 32-byte Ed25519 public key
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::Keypair;
    ///
    /// let secret = [1u8; 32];
    /// let public = [2u8; 32];
    /// let keypair = Keypair::from_raw_keys(secret, public);
    /// ```
    pub fn from_raw_keys(secret: [u8; 32], public: [u8; 32]) -> Self {
        Self {
            public: PublicKey::new(public),
            secret: SecretKey::new(secret),
        }
    }

    /// Get the public key.
    pub fn public_key(&self) -> &PublicKey {
        &self.public
    }

    /// Get the secret key.
    pub fn secret_key(&self) -> &SecretKey {
        &self.secret
    }

    /// Get the signature hint (last 4 bytes of the public key).
    pub fn signature_hint(&self) -> [u8; 4] {
        self.public.signature_hint()
    }
}

/// A Stellar account ID (public key in strkey format).
///
/// This is a convenience type for working with Stellar account addresses
/// in their string format (starting with 'G').
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct AccountId(String);

impl AccountId {
    /// Create a new account ID from a string.
    ///
    /// # Arguments
    ///
    /// * `id` - The account ID string (e.g., "G...")
    pub fn new<S: Into<String>>(id: S) -> Self {
        Self(id.into())
    }

    /// Get the account ID as a string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for AccountId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Network passphrase for identifying Stellar networks.
///
/// Stellar uses network passphrases to distinguish between different
/// networks (testnet, mainnet, etc.) and prevent replay attacks.
///
/// # Common Passphrases
///
/// - **Testnet**: "Test SDF Network ; September 2015"
/// - **Mainnet**: "Public Global Stellar Network ; September 2015"
/// - **Futurenet**: "Test SDF Future Network ; December 2024"
///
/// # Examples
///
/// ```
/// use fluid_core::NetworkPassphrase;
///
/// // Testnet
/// let testnet = NetworkPassphrase::testnet();
/// assert_eq!(testnet.as_str(), "Test SDF Network ; September 2015");
///
/// // Mainnet
/// let mainnet = NetworkPassphrase::mainnet();
/// ```
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NetworkPassphrase(String);

impl NetworkPassphrase {
    /// Create a custom network passphrase.
    pub fn new<S: Into<String>>(passphrase: S) -> Self {
        Self(passphrase.into())
    }

    /// Get the testnet passphrase.
    pub fn testnet() -> Self {
        Self::new("Test SDF Network ; September 2015")
    }

    /// Get the mainnet passphrase.
    pub fn mainnet() -> Self {
        Self::new("Public Global Stellar Network ; September 2015")
    }

    /// Get the futurenet passphrase.
    pub fn futurenet() -> Self {
        Self::new("Test SDF Future Network ; December 2024")
    }

    /// Get the passphrase as a string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for NetworkPassphrase {
    fn default() -> Self {
        Self::testnet()
    }
}

/// Fee configuration for transaction building.
///
/// This type holds the base fee and multiplier used when calculating
/// transaction fees.
///
/// # Examples
///
/// ```
/// use fluid_core::FeeConfig;
///
/// let config = FeeConfig::new(100, 2.0);
/// let fee = config.calculate_fee(3); // (3 + 1) * 100 * 2.0 = 800
/// ```
#[derive(Clone, Copy, Debug)]
pub struct FeeConfig {
    base_fee: u32,
    multiplier: f64,
}

impl FeeConfig {
    /// Create a new fee configuration.
    ///
    /// # Arguments
    ///
    /// * `base_fee` - The base fee in stroops (1 XLM = 10,000,000 stroops)
    /// * `multiplier` - The fee multiplier (typically 1.0 or higher)
    pub fn new(base_fee: u32, multiplier: f64) -> Self {
        Self {
            base_fee,
            multiplier,
        }
    }

    /// Get the default fee configuration.
    ///
    /// Uses a base fee of 100 stroops with a 1.0 multiplier.
    pub fn default_config() -> Self {
        Self::new(100, 1.0)
    }

    /// Calculate the fee for a given number of operations.
    ///
    /// The formula is: `(operation_count + 1) * base_fee * multiplier`
    /// The +1 accounts for the fee-bump operation itself.
    ///
    /// # Arguments
    ///
    /// * `operation_count` - The number of operations in the inner transaction
    ///
    /// # Returns
    ///
    /// The calculated fee in stroops.
    pub fn calculate_fee(&self, operation_count: usize) -> u64 {
        let base = (operation_count as u64 + 1) * self.base_fee as u64;
        (base as f64 * self.multiplier).ceil() as u64
    }

    /// Get the base fee.
    pub fn base_fee(&self) -> u32 {
        self.base_fee
    }

    /// Get the fee multiplier.
    pub fn multiplier(&self) -> f64 {
        self.multiplier
    }
}

impl Default for FeeConfig {
    fn default() -> Self {
        Self::default_config()
    }
}

/// A decorated signature as used in Stellar transactions.
///
/// Stellar signatures consist of a 4-byte hint identifying the signer
/// and a 64-byte Ed25519 signature.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecoratedSignature {
    hint: [u8; 4],
    signature: [u8; 64],
}

impl DecoratedSignature {
    /// Create a new decorated signature.
    ///
    /// # Arguments
    ///
    /// * `hint` - The 4-byte signature hint (last 4 bytes of public key)
    /// * `signature` - The 64-byte Ed25519 signature
    pub fn new(hint: [u8; 4], signature: [u8; 64]) -> Self {
        Self { hint, signature }
    }

    /// Get the signature hint.
    pub fn hint(&self) -> [u8; 4] {
        self.hint
    }

    /// Get the signature bytes.
    pub fn signature(&self) -> [u8; 64] {
        self.signature
    }
}

/// Transaction hash used for signing.
///
/// This is a 32-byte hash of the transaction data that is signed
/// to authorize the transaction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TransactionHash([u8; 32]);

impl TransactionHash {
    /// Create a new transaction hash from bytes.
    pub fn new(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Get the hash bytes.
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl AsRef<[u8]> for TransactionHash {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// A fee payer account configuration.
///
/// This type combines a secret key, public key, and keypair for a fee payer
/// account that can sign fee-bump transactions.
///
/// # Security
///
/// The secret key is stored in a [`Zeroizing`] wrapper for secure memory handling.
///
/// # Examples
///
/// ```
/// use fluid_core::{FeePayerAccount, Keypair};
///
/// // Create a fee payer account (in practice, load from secure storage)
/// let account = FeePayerAccount::new(
///     "secret".to_string(),
///     [1u8; 32],
///     Keypair::from_raw_keys([1u8; 32], [2u8; 32]),
/// );
/// ```
#[derive(Clone, Debug)]
pub struct FeePayerAccount {
    /// The secret key as a string (for reference/serialization).
    pub secret: String,
    /// The 32-byte public key.
    pub public_key: [u8; 32],
    /// The keypair for signing.
    pub keypair: Keypair,
}

impl FeePayerAccount {
    /// Create a new fee payer account.
    ///
    /// # Arguments
    ///
    /// * `secret` - The secret key string
    /// * `public_key` - The 32-byte public key
    /// * `keypair` - The signing keypair
    pub fn new(secret: String, public_key: [u8; 32], keypair: Keypair) -> Self {
        Self {
            secret,
            public_key,
            keypair,
        }
    }

    /// Get the public key as a slice.
    pub fn public_key_bytes(&self) -> &[u8; 32] {
        &self.public_key
    }
}
