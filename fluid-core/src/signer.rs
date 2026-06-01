//! Signing traits and implementations for Stellar transactions.
//!
//! This module defines the [`Signer`] trait and provides concrete implementations
//! for signing transactions with Ed25519 keys. Users can implement the trait
//! for custom signing backends (HSM, cloud KMS, passkey, etc.).

use ed25519_dalek::SigningKey;
use stellar_strkey::Strkey;

use crate::error::FluidError;
use crate::types::{DecoratedSignature, Keypair, PublicKey, TransactionHash};

/// Trait for signing Stellar transactions.
///
/// Implementors of this trait provide the ability to sign transaction hashes
/// and produce decorated signatures suitable for inclusion in Stellar transactions.
///
/// # Examples
///
/// ## Implementing a custom signer
///
/// ```
/// use fluid_core::{Signer, TransactionHash, DecoratedSignature, PublicKey};
/// use fluid_core::FluidError;
///
/// struct MyCustomSigner;
///
/// impl Signer for MyCustomSigner {
///     fn public_key(&self) -> &PublicKey {
///         todo!("Return your signer's public key")
///     }
///
///     fn sign_hash(&self, hash: &TransactionHash) -> Result<DecoratedSignature, FluidError> {
///         // Your custom signing logic here
///         todo!("Implement signing")
///     }
///
///     fn sign_payload(&self, payload: &[u8]) -> Result<[u8; 64], FluidError> {
///         todo!("Implement signing")
///     }
/// }
/// ```
pub trait Signer: Send + Sync {
    /// Get the public key associated with this signer.
    ///
    /// # Returns
    ///
    /// A reference to the signer's public key.
    fn public_key(&self) -> &PublicKey;

    /// Sign a transaction hash.
    ///
    /// # Arguments
    ///
    /// * `hash` - The 32-byte transaction hash to sign
    ///
    /// # Returns
    ///
    /// A decorated signature containing the signature hint and the 64-byte signature.
    ///
    /// # Errors
    ///
    /// Returns [`FluidError::SigningFailed`] if the signing operation fails.
    fn sign_hash(&self, hash: &TransactionHash) -> Result<DecoratedSignature, FluidError>;

    /// Sign a raw payload directly.
    ///
    /// This is a lower-level method that signs arbitrary bytes rather than
    /// a transaction hash. Most users should use [`sign_hash`](Signer::sign_hash).
    ///
    /// # Arguments
    ///
    /// * `payload` - The bytes to sign
    ///
    /// # Returns
    ///
    /// A 64-byte Ed25519 signature.
    ///
    /// # Errors
    ///
    /// Returns [`FluidError::SigningFailed`] if the signing operation fails.
    fn sign_payload(&self, payload: &[u8]) -> Result<[u8; 64], FluidError>;
}

/// A signer implementation using an in-memory Ed25519 keypair.
///
/// This is the most common signer type, suitable for applications that
/// manage their own keys.
///
/// # Security
///
/// - Keys should be loaded from secure storage, not hardcoded
/// - Consider using a more secure signer (HSM, KMS) for production
/// - The signing key is stored in memory; use memory protection as needed
///
/// # Examples
///
/// ```
/// use fluid_core::{Ed25519Signer, Keypair, Signer};
///
/// // Create from raw key bytes (in practice, load from secure storage)
/// let secret = [1u8; 32];
/// let public = [2u8; 32];
/// let keypair = Keypair::from_raw_keys(secret, public);
/// let signer = Ed25519Signer::new(keypair);
///
/// // Use the signer to sign transactions
/// // signer.sign_hash(&transaction_hash)?;
/// // signer.sign_payload(&[0u8; 32])?;
/// ```
#[derive(Clone, Debug)]
pub struct Ed25519Signer {
    keypair: Keypair,
    signing_key: SigningKey,
}

impl Ed25519Signer {
    /// Create a new Ed25519 signer from a keypair.
    ///
    /// # Arguments
    ///
    /// * `keypair` - The keypair containing both secret and public keys
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::{Ed25519Signer, Keypair};
    ///
    /// let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
    /// let signer = Ed25519Signer::new(keypair);
    /// ```
    pub fn new(keypair: Keypair) -> Self {
        let secret_bytes = keypair.secret_key().as_bytes();
        let signing_key = SigningKey::from_bytes(secret_bytes);

        Self {
            keypair,
            signing_key,
        }
    }

    /// Create a signer from a Stellar secret key string.
    ///
    /// Parses a Stellar secret key in strkey format (starting with 'S') and
    /// creates a signer from it.
    ///
    /// # Arguments
    ///
    /// * `secret` - The Stellar secret key string (e.g., "S...")
    ///
    /// # Errors
    ///
    /// Returns [`FluidError::InvalidSecret`] if the secret key is malformed
    /// or not a valid Ed25519 private key.
    ///
    /// # Examples
    ///
    /// ```
    /// use fluid_core::Ed25519Signer;
    ///
    /// // This would work with a real secret key:
    /// // let signer = Ed25519Signer::from_secret("S...");
    /// ```
    pub fn from_secret(secret: &str) -> Result<Self, FluidError> {
        let secret_key = decode_secret(secret)?;
        let signing_key = SigningKey::from_bytes(&secret_key);
        let public_key = PublicKey::new(signing_key.verifying_key().to_bytes());

        let keypair = Keypair::from_raw_keys(secret_key, public_key.as_bytes().clone());

        Ok(Self {
            keypair,
            signing_key,
        })
    }

    /// Get the underlying keypair.
    pub fn keypair(&self) -> &Keypair {
        &self.keypair
    }
}

impl Signer for Ed25519Signer {
    fn public_key(&self) -> &PublicKey {
        self.keypair.public_key()
    }

    fn sign_hash(&self, hash: &TransactionHash) -> Result<DecoratedSignature, FluidError> {
        let signature = self.sign_payload(hash.as_ref())?;
        let hint = self.keypair.signature_hint();

        Ok(DecoratedSignature::new(hint, signature))
    }

    fn sign_payload(&self, payload: &[u8]) -> Result<[u8; 64], FluidError> {
        use ed25519_dalek::Signer as DalekSigner;
        let signature = self
            .signing_key
            .sign(payload)
            .to_bytes();

        Ok(signature)
    }
}

/// Decode a Stellar secret key string.
///
/// Parses a Stellar secret key in strkey format and returns the raw 32-byte key.
///
/// # Arguments
///
/// * `secret` - The secret key string (e.g., "S...")
///
/// # Errors
///
/// Returns [`FluidError::InvalidSecret`] if:
/// - The string is not valid strkey format
/// - The key type is not Ed25519 private key
fn decode_secret(secret: &str) -> Result<[u8; 32], FluidError> {
    match Strkey::from_string(secret) {
        Ok(Strkey::PrivateKeyEd25519(key)) => Ok(key.0),
        Ok(_) => Err(FluidError::InvalidSecret(
            "expected a Stellar ed25519 private key".to_string(),
        )),
        Err(err) => Err(FluidError::InvalidSecret(format!(
            "invalid Stellar secret: {err}"
        ))),
    }
}

/// A signer that delegates to an async signing backend.
///
/// This is useful when signing operations need to happen asynchronously,
/// such as when calling out to a remote KMS or HSM.
///
/// # Type Parameters
///
/// * `F` - The async function type that performs the signing
#[derive(Clone)]
pub struct AsyncSigner<F> {
    public_key: PublicKey,
    signer_fn: F,
}

impl<F> AsyncSigner<F>
where
    F: Fn(&[u8]) -> Result<[u8; 64], FluidError> + Send + Sync,
{
    /// Create a new async signer.
    ///
    /// # Arguments
    ///
    /// * `public_key` - The signer's public key
    /// * `signer_fn` - A function that signs payloads
    pub fn new(public_key: PublicKey, signer_fn: F) -> Self {
        Self {
            public_key,
            signer_fn,
        }
    }
}

impl<F> Signer for AsyncSigner<F>
where
    F: Fn(&[u8]) -> Result<[u8; 64], FluidError> + Send + Sync,
{
    fn public_key(&self) -> &PublicKey {
        &self.public_key
    }

    fn sign_hash(&self, hash: &TransactionHash) -> Result<DecoratedSignature, FluidError> {
        let signature = self.sign_payload(hash.as_ref())?;
        let hint = self.public_key.signature_hint();

        Ok(DecoratedSignature::new(hint, signature))
    }

    fn sign_payload(&self, payload: &[u8]) -> Result<[u8; 64], FluidError> {
        (self.signer_fn)(payload)
    }
}

/// A signer that uses a pre-shared key for testing.
///
/// # Warning
///
/// This signer is intended for testing only. It uses a hardcoded key
/// and provides no security. Never use this in production.
#[derive(Clone, Debug)]
pub struct TestSigner {
    keypair: Keypair,
    signing_key: SigningKey,
}

impl TestSigner {
    /// Create a test signer with a hardcoded key.
    ///
    /// # Warning
    ///
    /// This is insecure and for testing only!
    pub fn new() -> Self {
        // Hardcoded test key - DO NOT USE IN PRODUCTION
        let secret_bytes = [0xcd; 32];
        let signing_key = SigningKey::from_bytes(&secret_bytes);
        let public_key = PublicKey::new(signing_key.verifying_key().to_bytes());
        let keypair = Keypair::from_raw_keys(secret_bytes, public_key.as_bytes().clone());

        Self {
            keypair,
            signing_key,
        }
    }
}

impl Default for TestSigner {
    fn default() -> Self {
        Self::new()
    }
}

impl Signer for TestSigner {
    fn public_key(&self) -> &PublicKey {
        self.keypair.public_key()
    }

    fn sign_hash(&self, hash: &TransactionHash) -> Result<DecoratedSignature, FluidError> {
        let signature = self.sign_payload(hash.as_ref())?;
        let hint = self.keypair.signature_hint();

        Ok(DecoratedSignature::new(hint, signature))
    }

    fn sign_payload(&self, payload: &[u8]) -> Result<[u8; 64], FluidError> {
        use ed25519_dalek::Signer as DalekSigner;
        let signature = self
            .signing_key
            .sign(payload)
            .to_bytes();

        Ok(signature)
    }
}

/// A signer that wraps multiple signers for multi-sig operations.
///
/// This signer can produce signatures from multiple underlying signers,
/// useful for accounts that require multiple signatures.
pub struct MultiSigner {
    signers: Vec<Box<dyn Signer>>,
}

impl MultiSigner {
    /// Create a new multi-signer.
    ///
    /// # Arguments
    ///
    /// * `signers` - The signers to include
    pub fn new(signers: Vec<Box<dyn Signer>>) -> Self {
        Self { signers }
    }

    /// Sign a hash with all underlying signers.
    ///
    /// # Arguments
    ///
    /// * `hash` - The transaction hash to sign
    ///
    /// # Returns
    ///
    /// A vector of decorated signatures, one from each signer.
    pub fn sign_hash_multi(&self, hash: &TransactionHash) -> Vec<Result<DecoratedSignature, FluidError>> {
        self.signers
            .iter()
            .map(|signer| signer.sign_hash(hash))
            .collect()
    }
}
