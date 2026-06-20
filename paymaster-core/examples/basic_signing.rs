//! Minimal example: build and sign a transaction.
//!
//! Run with: `cargo run --example basic_signing`
//!
//! This example shows the simplest possible use of fluid-core:
//! - Creating a signer from a keypair
//! - Configuring fee-bump transaction parameters
//! - Building and signing a fee-bump wrapper

use fluid_core::{
    Ed25519Signer, FeeConfig, Keypair, NetworkPassphrase, PublicKey, Signer,
    TransactionBuilder, TransactionHash, DecoratedSignature, FluidError,
};

fn main() -> Result<(), FluidError> {
    println!("=== Fluid Core Basic Signing Example ===\n");

    // Step 1: Create a fee payer keypair and signer
    // In production, load this from secure storage (HSM, KMS, env var)
    println!("1. Creating fee payer signer...");
    let fee_payer_secret = [0xab; 32]; // Example secret - use real key in production
    let fee_payer_public = [0xcd; 32]; // Example public key
    let fee_payer_keypair = Keypair::from_raw_keys(fee_payer_secret, fee_payer_public);
    let signer = Ed25519Signer::new(fee_payer_keypair.clone());
    println!("   Created signer with public key: {:02x?}", fee_payer_public);

    // Step 2: Configure the transaction builder
    println!("\n2. Configuring transaction builder...");
    let base_fee = 100; // 100 stroops base fee
    let fee_multiplier = 2.0; // Double the base fee for priority
    let network = NetworkPassphrase::testnet();

    let builder = TransactionBuilder::new()
        .base_fee(base_fee)
        .fee_multiplier(fee_multiplier)
        .network_passphrase(network.clone())
        .fee_payer(PublicKey::new(fee_payer_public));

    println!("   Base fee: {} stroops", base_fee);
    println!("   Fee multiplier: {}", fee_multiplier);
    println!("   Network: {}", network.as_str());

    // Step 3: Calculate fees for different operation counts
    println!("\n3. Fee calculation examples:");
    for op_count in [1, 3, 10] {
        let fee = builder.calculate_fee(op_count);
        println!("   {} operations: {} stroops", op_count, fee);
    }

    // Step 4: Simulate building a fee-bump transaction
    // In a real scenario, you would have:
    // - An inner transaction XDR from a user
    // - The inner transaction hash for signing
    // - Signatures from the inner transaction
    println!("\n4. Simulating fee-bump transaction...");

    // Simulate an inner transaction hash (normally computed from XDR)
    let inner_hash = TransactionHash::new([0xef; 32]);

    // Simulate an inner transaction signature
    let user_signature = DecoratedSignature::new(
        [0x12, 0x34, 0x56, 0x78], // Signature hint (last 4 bytes of user's public key)
        [0xaa; 64],                  // 64-byte signature (placeholder)
    );

    // Build the fee-bump transaction
    let fee_bump_tx = builder
        .inner_hash(inner_hash)
        .add_signature(user_signature)
        .build(&signer, 3)?; // 3 operations

    println!("   Fee-bump transaction built successfully!");
    println!("   Fee amount: {} stroops", fee_bump_tx.fee());
    println!("   Fee payer: {:02x?}", fee_bump_tx.fee_payer().as_bytes());
    println!("   Inner signatures: {}", fee_bump_tx.inner_signatures().len());
    println!("   Fee-bump signature hint: {:02x?}", fee_bump_tx.fee_bump_signature().hint());

    // Step 5: Sign a raw payload (low-level signing)
    println!("\n5. Demonstrating raw payload signing...");
    let test_payload = b"Hello, Stellar!";
    let raw_signature = signer.sign_payload(test_payload)?;
    println!("   Signed payload: {:?}", std::str::from_utf8(test_payload).unwrap());
    println!("   Signature (first 8 bytes): {:02x?}", &raw_signature[..8]);

    println!("\n=== Example completed successfully ===");
    Ok(())
}
