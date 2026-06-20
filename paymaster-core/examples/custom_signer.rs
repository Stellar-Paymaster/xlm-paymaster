//! Example: implement the Signer trait for a custom signing backend.
//!
//! Run with: `cargo run --example custom_signer`
//!
//! This example demonstrates how to implement the Signer trait for a custom
//! signing backend. This is the primary use case for library users who have
//! their own key management systems (HSM, cloud KMS, passkey, etc.).

use fluid_core::{
    DecoratedSignature, FluidError, PublicKey, Signer, TransactionHash,
    TransactionBuilder, NetworkPassphrase,
};
use std::sync::{Arc, Mutex};

/// A custom signer that simulates a Hardware Security Module (HSM).
///
/// In production, this would communicate with an actual HSM device or
/// cloud KMS service like AWS KMS, Google Cloud KMS, or Azure Key Vault.
struct HsmSigner {
    /// The public key corresponding to the key in the HSM
    public_key: PublicKey,
    /// A unique key ID for the HSM to identify which key to use
    key_id: String,
    /// Simulated HSM operation counter (for audit logging)
    operation_count: Arc<Mutex<u64>>,
}

impl HsmSigner {
    /// Create a new HSM signer.
    ///
    /// # Arguments
    ///
    /// * `public_key` - The public key of the HSM-stored key
    /// * `key_id` - The unique identifier for the key in the HSM
    fn new(public_key: PublicKey, key_id: String) -> Self {
        Self {
            public_key,
            key_id,
            operation_count: Arc::new(Mutex::new(0)),
        }
    }

    /// Get the number of signing operations performed.
    fn operation_count(&self) -> u64 {
        *self.operation_count.lock().unwrap()
    }

    /// Simulate calling the HSM to sign data.
    ///
    /// In production, this would make an API call to the HSM service.
    fn call_hsm(&self, data: &[u8]) -> Result<[u8; 64], FluidError> {
        // Increment operation counter for audit purposes
        let mut count = self.operation_count.lock().unwrap();
        *count += 1;

        println!("   [HSM] Signing with key ID: {}", self.key_id);
        println!("   [HSM] Data length: {} bytes", data.len());

        // In a real implementation, this would:
        // 1. Authenticate with the HSM/KMS
        // 2. Request the signing operation
        // 3. Return the signature

        // For this example, we simulate a signature by using a deterministic
        // derivation from the input data (NEVER do this in production!)
        let mut signature = [0u8; 64];
        for (i, byte) in data.iter().enumerate().take(64) {
            signature[i] = byte.wrapping_add(i as u8);
        }

        // Simulate network latency
        std::thread::sleep(std::time::Duration::from_millis(10));

        println!("   [HSM] Signature generated (operation #{})", *count);

        Ok(signature)
    }
}

impl Signer for HsmSigner {
    fn public_key(&self) -> &PublicKey {
        &self.public_key
    }

    fn sign_hash(&self, hash: &TransactionHash) -> Result<DecoratedSignature, FluidError> {
        let signature = self.sign_payload(hash.as_ref())?;
        let hint = self.public_key.signature_hint();

        Ok(DecoratedSignature::new(hint, signature))
    }

    fn sign_payload(&self, payload: &[u8]) -> Result<[u8; 64], FluidError> {
        self.call_hsm(payload)
    }
}

/// A custom signer that simulates a remote signing service.
///
/// This could represent a microservice that holds signing keys
/// and exposes a signing API over HTTP or gRPC.
struct RemoteSigner {
    public_key: PublicKey,
    endpoint: String,
    api_token: String,
}

impl RemoteSigner {
    fn new(public_key: PublicKey, endpoint: String, api_token: String) -> Self {
        Self {
            public_key,
            endpoint,
            api_token,
        }
    }

    fn call_remote_api(&self, payload: &[u8]) -> Result<[u8; 64], FluidError> {
        println!("   [Remote] Calling signing service at: {}", self.endpoint);
        println!("   [Remote] API token: {}...", &self.api_token[..8.min(self.api_token.len())]);
        println!("   [Remote] Payload: {} bytes", payload.len());

        // In production, this would:
        // 1. Make an HTTP/gRPC request to the signing service
        // 2. Include the API token for authentication
        // 3. Receive the signature in the response

        // Simulate signature generation
        let mut signature = [0u8; 64];
        signature[0..32].copy_from_slice(&self.public_key.as_bytes()[0..32]);
        signature[32..64].copy_from_slice(payload);

        println!("   [Remote] Signature received from remote service");

        Ok(signature)
    }
}

impl Signer for RemoteSigner {
    fn public_key(&self) -> &PublicKey {
        &self.public_key
    }

    fn sign_hash(&self, hash: &TransactionHash) -> Result<DecoratedSignature, FluidError> {
        let signature = self.sign_payload(hash.as_ref())?;
        let hint = self.public_key.signature_hint();

        Ok(DecoratedSignature::new(hint, signature))
    }

    fn sign_payload(&self, payload: &[u8]) -> Result<[u8; 64], FluidError> {
        self.call_remote_api(payload)
    }
}

fn main() -> Result<(), FluidError> {
    println!("=== Custom Signer Example ===\n");

    // Example 1: HSM Signer
    println!("1. Testing HSM Signer");
    println!("   -------------------");

    let hsm_public = PublicKey::new([0xa1; 32]);
    let hsm_signer = HsmSigner::new(hsm_public.clone(), "key-12345".to_string());

    println!("   Created HSM signer for key: {:02x?}", hsm_public.as_bytes());
    println!("   Key ID: key-12345");

    // Sign a transaction hash
    let hash1 = TransactionHash::new([0xb2; 32]);
    println!("\n   Signing transaction hash...");
    let sig1 = hsm_signer.sign_hash(&hash1)?;
    println!("   Signature hint: {:02x?}", sig1.hint());
    println!("   Signature (first 8 bytes): {:02x?}", &sig1.signature()[..8]);

    // Sign another hash
    let hash2 = TransactionHash::new([0xc3; 32]);
    println!("\n   Signing second transaction hash...");
    let sig2 = hsm_signer.sign_hash(&hash2)?;
    println!("   Signature hint: {:02x?}", sig2.hint());

    println!("\n   Total HSM operations: {}", hsm_signer.operation_count());

    // Example 2: Remote Signer
    println!("\n2. Testing Remote Signer");
    println!("   ----------------------");

    let remote_public = PublicKey::new([0xd4; 32]);
    let remote_signer = RemoteSigner::new(
        remote_public.clone(),
        "https://signing.example.com/v1/sign".to_string(),
        "sk_live_abc123xyz789".to_string(),
    );

    println!("   Created remote signer for key: {:02x?}", remote_public.as_bytes());

    let hash3 = TransactionHash::new([0xe5; 32]);
    println!("\n   Signing via remote API...");
    let sig3 = remote_signer.sign_hash(&hash3)?;
    println!("   Signature hint: {:02x?}", sig3.hint());

    // Example 3: Using custom signers with TransactionBuilder
    println!("\n3. Using Custom Signers with TransactionBuilder");
    println!("   ---------------------------------------------");

    let builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_multiplier(1.5)
        .network_passphrase(NetworkPassphrase::testnet())
        .fee_payer(hsm_public.clone());

    println!("   Building transaction with HSM signer...");

    // Simulate an inner transaction
    let inner_hash = TransactionHash::new([0xf6; 32]);
    let user_sig = DecoratedSignature::new([0x78; 4], [0x90; 64]);

    let fee_bump_tx = builder
        .inner_hash(inner_hash)
        .add_signature(user_sig)
        .build(&hsm_signer, 2)?;

    println!("   Fee-bump transaction built!");
    println!("   Fee: {} stroops", fee_bump_tx.fee());
    println!("   Fee-bump signature ready for submission");

    println!("\n=== Example completed successfully ===");
    Ok(())
}
