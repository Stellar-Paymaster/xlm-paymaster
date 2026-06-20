//! Example: build a transaction with all optional fields.
//!
//! Run with: `cargo run --example transaction_builder`
//!
//! This example demonstrates the full transaction builder API, showing
//! all configuration options and the complete builder chain.

use fluid_core::{
    Ed25519Signer, FeeConfig, FeePayerAccount, Keypair, NetworkPassphrase, PublicKey,
    TransactionBuilder, TransactionHash, DecoratedSignature, FluidError,
};

fn main() -> Result<(), FluidError> {
    println!("=== Transaction Builder Example ===\n");

    // Create a fee payer for demonstration
    let fee_payer_secret = [0x01; 32];
    let fee_payer_public = [0x02; 32];
    let fee_payer_keypair = Keypair::from_raw_keys(fee_payer_secret, fee_payer_public);
    let signer = Ed25519Signer::new(fee_payer_keypair.clone());

    // Example 1: Basic configuration
    println!("1. Basic TransactionBuilder Configuration");
    println!("   ---------------------------------------");

    let basic_builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_multiplier(1.0)
        .network_passphrase(NetworkPassphrase::testnet())
        .fee_payer(PublicKey::new(fee_payer_public));

    println!("   Base fee: 100 stroops");
    println!("   Multiplier: 1.0x");
    println!("   Network: Testnet");
    println!("   Fee calculations:");
    for ops in [1, 2, 5, 10] {
        let fee = basic_builder.calculate_fee(ops);
        println!("     {} ops -> {} stroops", ops, fee);
    }

    // Example 2: High-priority configuration
    println!("\n2. High-Priority Transaction (2.5x multiplier)");
    println!("   -------------------------------------------");

    let priority_builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_multiplier(2.5) // High multiplier for faster inclusion
        .network_passphrase(NetworkPassphrase::mainnet())
        .fee_payer(PublicKey::new(fee_payer_public));

    println!("   Base fee: 100 stroops");
    println!("   Multiplier: 2.5x (high priority)");
    println!("   Network: Mainnet");
    println!("   Fee calculations:");
    for ops in [1, 3, 10] {
        let fee = priority_builder.calculate_fee(ops);
        let lumens = fee as f64 / 10_000_000.0;
        println!("     {} ops -> {} stroops ({:.7} XLM)", ops, fee, lumens);
    }

    // Example 3: Custom base fee
    println!("\n3. Custom Base Fee Configuration");
    println!("   -------------------------------");

    let custom_builder = TransactionBuilder::new()
        .base_fee(500) // Higher base fee for complex operations
        .fee_multiplier(1.2)
        .network_passphrase(NetworkPassphrase::futurenet())
        .fee_payer(PublicKey::new(fee_payer_public));

    println!("   Base fee: 500 stroops (for complex ops)");
    println!("   Multiplier: 1.2x");
    println!("   Network: Futurenet");
    println!("   Fee: {} stroops for 5 ops", custom_builder.calculate_fee(5));

    // Example 4: FeeConfig utility
    println!("\n4. Using FeeConfig Directly");
    println!("   --------------------------");

    let config = FeeConfig::new(100, 2.0);
    println!("   FeeConfig base_fee: {}", config.base_fee());
    println!("   FeeConfig multiplier: {}", config.multiplier());
    println!("   Calculated fees:");

    for ops in [1, 2, 3, 5, 10] {
        let fee = config.calculate_fee(ops);
        let formula = format!("({}+1) * {} * {}", ops, config.base_fee(), config.multiplier());
        println!("     {} ops: {} stroops  [formula: {}]", ops, fee, formula);
    }

    // Example 5: Default configuration
    println!("\n5. Default Configuration");
    println!("   ---------------------");

    let default_builder = TransactionBuilder::new();
    let default_config = default_builder.fee_config();

    println!("   Base fee: {}", default_config.base_fee());
    println!("   Multiplier: {}", default_config.multiplier());
    println!("   Network: {}", default_builder.network().as_str());

    // Example 6: Building a complete fee-bump transaction
    println!("\n6. Complete Fee-Bump Transaction Build");
    println!("   ------------------------------------");

    // Simulate receiving an inner transaction from a user
    let user_public = [0xaa; 32];
    let inner_transaction_xdr = "AAAAAQAAAAA..."; // Placeholder XDR
    let inner_transaction_hash = TransactionHash::new([0xbb; 32]);

    // User's signature on the inner transaction
    let user_signature = DecoratedSignature::new(
        [user_public[28], user_public[29], user_public[30], user_public[31]],
        [0xcc; 64],
    );

    println!("   Inner transaction received:");
    println!("     XDR preview: {}...", &inner_transaction_xdr[..15.min(inner_transaction_xdr.len())]);
    println!("     Hash: {:02x?}", inner_transaction_hash.as_bytes());
    println!("     User signature hint: {:02x?}", user_signature.hint());

    // Build the fee-bump transaction
    let builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_multiplier(2.0)
        .network_passphrase(NetworkPassphrase::testnet())
        .inner_xdr(inner_transaction_xdr.to_string())
        .inner_hash(inner_transaction_hash.clone())
        .add_signature(user_signature)
        .fee_payer(PublicKey::new(fee_payer_public));

    // Assume the inner transaction has 3 operations
    let operation_count = 3;
    let calculated_fee = builder.calculate_fee(operation_count);

    println!("\n   Building fee-bump transaction:");
    println!("     Operations in inner tx: {}", operation_count);
    println!("     Calculated fee: {} stroops", calculated_fee);
    println!("     Fee payer: {:02x?}", fee_payer_public);

    let fee_bump_tx = builder.build(&signer, operation_count)?;

    println!("\n   Fee-bump transaction created:");
    println!("     Total fee: {} stroops", fee_bump_tx.fee());
    println!("     Fee payer: {:02x?}", fee_bump_tx.fee_payer().as_bytes());
    println!("     Fee-bump signature hint: {:02x?}", fee_bump_tx.fee_bump_signature().hint());
    println!("     Inner signatures preserved: {}", fee_bump_tx.inner_signatures().len());

    // Example 7: Multiple signatures
    println!("\n7. Transaction with Multiple Inner Signatures");
    println!("   ------------------------------------------");

    let multi_sig_builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_multiplier(1.5)
        .network_passphrase(NetworkPassphrase::testnet())
        .fee_payer(PublicKey::new(fee_payer_public))
        .inner_hash(TransactionHash::new([0xdd; 32]))
        .add_signature(DecoratedSignature::new([0x11; 4], [0x22; 64]))
        .add_signature(DecoratedSignature::new([0x33; 4], [0x44; 64]))
        .add_signature(DecoratedSignature::new([0x55; 4], [0x66; 64]));

    let multi_sig_tx = multi_sig_builder.build(&signer, 2)?;
    println!("   Added 3 inner signatures");
    println!("   Total signatures in envelope: {}", multi_sig_tx.inner_signatures().len() + 1);

    // Example 8: Error handling demonstration
    println!("\n8. Error Handling Examples");
    println!("   -----------------------");

    // Missing inner transaction
    let incomplete_builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_payer(PublicKey::new(fee_payer_public));

    match incomplete_builder.validate() {
        Err(FluidError::UnsignedTransaction) => {
            println!("   ✓ Correctly detected: Unsigned inner transaction");
        }
        Err(e) => println!("   ✓ Detected error: {}", e),
        Ok(_) => println!("   ✗ Should have failed validation"),
    }

    // Missing fee payer
    let no_payer_builder = TransactionBuilder::new()
        .base_fee(100)
        .inner_hash(TransactionHash::new([0xee; 32]))
        .add_signature(DecoratedSignature::new([0x77; 4], [0x88; 64]));

    match no_payer_builder.validate() {
        Err(FluidError::InvalidTransaction(_)) => {
            println!("   ✓ Correctly detected: Missing fee payer");
        }
        Err(e) => println!("   ✓ Detected error: {}", e),
        Ok(_) => println!("   ✗ Should have failed validation"),
    }

    // Example 9: FeePayerAccount integration
    println!("\n9. FeePayerAccount Integration");
    println!("   ----------------------------");

    let fee_payer_account = FeePayerAccount::new(
        "S...SECRET...".to_string(), // In production, this is the actual secret
        fee_payer_public,
        fee_payer_keypair.clone(),
    );

    println!("   FeePayerAccount created:");
    println!("     Public key: {:02x?}", fee_payer_account.public_key_bytes());
    println!("     Secret available: {}", !fee_payer_account.secret.is_empty());
    println!("     Has keypair: true");

    println!("\n=== Example completed successfully ===");
    Ok(())
}
