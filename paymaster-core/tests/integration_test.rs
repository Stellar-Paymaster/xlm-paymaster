//! Integration tests for fluid-core.
//!
//! These tests use only the public API to verify the crate's functionality.

use fluid_core::{
    AsyncSigner, DecoratedSignature, Ed25519Signer, FeeConfig, FeePayerAccount, FluidError,
    Keypair, MultiSigner, NetworkPassphrase, PublicKey, SecretKey, Signer, TestSigner,
    TransactionBuilder, TransactionHash, validate_not_fee_bump,
};

// ============================================================================
// Tests for types module
// ============================================================================

#[test]
fn test_public_key_creation() {
    let bytes = [1u8; 32];
    let pk = PublicKey::new(bytes);
    assert_eq!(pk.as_bytes(), &bytes);
}

#[test]
fn test_public_key_signature_hint() {
    let mut bytes = [0u8; 32];
    bytes[28] = 0x12;
    bytes[29] = 0x34;
    bytes[30] = 0x56;
    bytes[31] = 0x78;

    let pk = PublicKey::new(bytes);
    let hint = pk.signature_hint();
    assert_eq!(hint, [0x12, 0x34, 0x56, 0x78]);
}

#[test]
fn test_secret_key_creation() {
    let bytes = [2u8; 32];
    let sk = SecretKey::new(bytes);
    assert_eq!(sk.as_bytes(), &bytes);
}

#[test]
fn test_keypair_creation() {
    let secret = [1u8; 32];
    let public = [2u8; 32];
    let keypair = Keypair::from_raw_keys(secret, public);

    assert_eq!(keypair.public_key().as_bytes(), &public);
    assert_eq!(keypair.secret_key().as_bytes(), &secret);
}

#[test]
fn test_keypair_signature_hint() {
    let mut public = [0u8; 32];
    public[28] = 0xab;
    public[29] = 0xcd;
    public[30] = 0xef;
    public[31] = 0x01;

    let keypair = Keypair::from_raw_keys([0u8; 32], public);
    assert_eq!(keypair.signature_hint(), [0xab, 0xcd, 0xef, 0x01]);
}

#[test]
fn test_account_id() {
    let account = fluid_core::AccountId::new("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    assert_eq!(account.as_str(), "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
}

#[test]
fn test_network_passphrase_defaults() {
    let testnet = NetworkPassphrase::testnet();
    assert_eq!(testnet.as_str(), "Test SDF Network ; September 2015");

    let mainnet = NetworkPassphrase::mainnet();
    assert_eq!(mainnet.as_str(), "Public Global Stellar Network ; September 2015");

    let futurenet = NetworkPassphrase::futurenet();
    assert_eq!(futurenet.as_str(), "Test SDF Future Network ; December 2024");
}

#[test]
fn test_network_passphrase_default() {
    let default = NetworkPassphrase::default();
    assert_eq!(default.as_str(), "Test SDF Network ; September 2015");
}

#[test]
fn test_fee_config_calculation() {
    let config = FeeConfig::new(100, 1.0);
    // (1 + 1) * 100 * 1.0 = 200
    assert_eq!(config.calculate_fee(1), 200);
    // (3 + 1) * 100 * 1.0 = 400
    assert_eq!(config.calculate_fee(3), 400);
}

#[test]
fn test_fee_config_with_multiplier() {
    let config = FeeConfig::new(100, 2.0);
    // (1 + 1) * 100 * 2.0 = 400
    assert_eq!(config.calculate_fee(1), 400);
    // (3 + 1) * 100 * 2.0 = 800
    assert_eq!(config.calculate_fee(3), 800);
}

#[test]
fn test_fee_config_default() {
    let default = FeeConfig::default();
    assert_eq!(default.base_fee(), 100);
    assert_eq!(default.multiplier(), 1.0);
}

#[test]
fn test_decorated_signature() {
    let hint = [0x12, 0x34, 0x56, 0x78];
    let signature = [0xaa; 64];
    let decorated = DecoratedSignature::new(hint, signature);

    assert_eq!(decorated.hint(), hint);
    assert_eq!(decorated.signature(), signature);
}

#[test]
fn test_transaction_hash() {
    let bytes = [0xbb; 32];
    let hash = TransactionHash::new(bytes);
    assert_eq!(hash.as_bytes(), &bytes);
}

#[test]
fn test_fee_payer_account() {
    let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
    let account = FeePayerAccount::new("secret".to_string(), [2u8; 32], keypair);

    assert_eq!(account.secret, "secret");
    assert_eq!(account.public_key_bytes(), &[2u8; 32]);
}

// ============================================================================
// Tests for signer module
// ============================================================================

#[test]
fn test_ed25519_signer_creation() {
    let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
    let signer = Ed25519Signer::new(keypair);

    assert_eq!(signer.keypair().public_key().as_bytes(), &[2u8; 32]);
}

#[test]
fn test_ed25519_signer_public_key() {
    let public = [0xcd; 32];
    let keypair = Keypair::from_raw_keys([0xab; 32], public);
    let signer = Ed25519Signer::new(keypair);

    assert_eq!(signer.public_key().as_bytes(), &public);
}

#[test]
fn test_ed25519_signer_sign_payload() {
    let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
    let signer = Ed25519Signer::new(keypair);

    let payload = b"test payload";
    let signature = signer.sign_payload(payload).unwrap();

    // Ed25519 signatures are 64 bytes
    assert_eq!(signature.len(), 64);
}

#[test]
fn test_ed25519_signer_sign_hash() {
    let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
    let signer = Ed25519Signer::new(keypair);

    let hash = TransactionHash::new([0xee; 32]);
    let decorated = signer.sign_hash(&hash).unwrap();

    // Signature should be 64 bytes
    assert_eq!(decorated.signature().len(), 64);
    // Hint should be 4 bytes (last 4 of public key)
    assert_eq!(decorated.hint().len(), 4);
}

#[test]
fn test_test_signer_creation() {
    let signer = TestSigner::new();
    let _ = signer.public_key();
}

#[test]
fn test_test_signer_signing() {
    let signer = TestSigner::new();
    let payload = b"test";
    let signature = signer.sign_payload(payload).unwrap();
    assert_eq!(signature.len(), 64);
}

#[test]
fn test_async_signer() {
    let public = PublicKey::new([0x99; 32]);
    let signer = AsyncSigner::new(public.clone(), |payload: &[u8]| {
        let mut sig = [0u8; 64];
        sig[0..payload.len().min(64)].copy_from_slice(payload);
        Ok(sig)
    });

    assert_eq!(signer.public_key().as_bytes(), &[0x99; 32]);

    let hash = TransactionHash::new([0x11; 32]);
    let decorated = signer.sign_hash(&hash).unwrap();
    assert_eq!(decorated.signature().len(), 64);
}

#[test]
fn test_multi_signer() {
    let signer1 = TestSigner::new();
    let signer2 = TestSigner::new();

    let multi = MultiSigner::new(vec![
        Box::new(signer1),
        Box::new(signer2),
    ]);

    let hash = TransactionHash::new([0x22; 32]);
    let results = multi.sign_hash_multi(&hash);

    assert_eq!(results.len(), 2);
    assert!(results.iter().all(|r| r.is_ok()));
}

// ============================================================================
// Tests for transaction_builder module
// ============================================================================

#[test]
fn test_transaction_builder_default() {
    let builder = TransactionBuilder::new();
    let config = builder.fee_config();

    assert_eq!(config.base_fee(), 100);
    assert_eq!(config.multiplier(), 1.0);
    assert_eq!(builder.network().as_str(), "Test SDF Network ; September 2015");
}

#[test]
fn test_transaction_builder_chaining() {
    let builder = TransactionBuilder::new()
        .base_fee(200)
        .fee_multiplier(2.5)
        .network_passphrase(NetworkPassphrase::mainnet());

    let config = builder.fee_config();
    assert_eq!(config.base_fee(), 200);
    assert_eq!(config.multiplier(), 2.5);
    assert_eq!(builder.network().as_str(), "Public Global Stellar Network ; September 2015");
}

#[test]
fn test_transaction_builder_fee_calculation() {
    let builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_multiplier(2.0);

    // (1 + 1) * 100 * 2.0 = 400
    assert_eq!(builder.calculate_fee(1), 400);
    // (5 + 1) * 100 * 2.0 = 1200
    assert_eq!(builder.calculate_fee(5), 1200);
}

#[test]
fn test_transaction_builder_add_signatures() {
    let sig1 = DecoratedSignature::new([0x11; 4], [0x22; 64]);
    let sig2 = DecoratedSignature::new([0x33; 4], [0x44; 64]);

    let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
    let signer = Ed25519Signer::new(keypair);

    let builder = TransactionBuilder::new()
        .fee_payer(PublicKey::new([2u8; 32]))
        .inner_hash(TransactionHash::new([0xaa; 32]))
        .add_signature(sig1)
        .add_signature(sig2);

    // This should build successfully
    let result = builder.build(&signer, 3);
    assert!(result.is_ok());
}

#[test]
fn test_transaction_builder_validation_missing_inner() {
    let builder = TransactionBuilder::new()
        .fee_payer(PublicKey::new([2u8; 32]));

    // Missing inner transaction - should return InvalidTransaction
    let result = builder.validate();
    assert!(matches!(result, Err(FluidError::InvalidTransaction(_))));
}

#[test]
fn test_transaction_builder_validation_missing_fee_payer() {
    let builder = TransactionBuilder::new()
        .inner_hash(TransactionHash::new([0xaa; 32]))
        .add_signature(DecoratedSignature::new([0x11; 4], [0x22; 64]));

    let result = builder.validate();
    assert!(matches!(result, Err(FluidError::InvalidTransaction(_))));
}

#[test]
fn test_transaction_builder_build_success() {
    let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
    let signer = Ed25519Signer::new(keypair);

    let builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_multiplier(2.0)
        .network_passphrase(NetworkPassphrase::testnet())
        .fee_payer(PublicKey::new([2u8; 32]))
        .inner_hash(TransactionHash::new([0xbb; 32]))
        .add_signature(DecoratedSignature::new([0x33; 4], [0x44; 64]));

    let fee_bump_tx = builder.build(&signer, 3).unwrap();

    // (3 + 1) * 100 * 2.0 = 800
    assert_eq!(fee_bump_tx.fee(), 800);
    assert_eq!(fee_bump_tx.fee_payer().as_bytes(), &[2u8; 32]);
    assert_eq!(fee_bump_tx.inner_signatures().len(), 1);
    assert_eq!(fee_bump_tx.network_passphrase().as_str(), "Test SDF Network ; September 2015");
}

#[test]
fn test_validate_not_fee_bump() {
    // Valid inner transaction XDR
    assert!(validate_not_fee_bump("AAAA...").is_ok());

    // Fee-bumped transaction should fail
    assert!(matches!(
        validate_not_fee_bump("feeBump:something"),
        Err(FluidError::AlreadyFeeBumped)
    ));
}

// ============================================================================
// Tests for error module
// ============================================================================

#[test]
fn test_fluid_error_invalid_tx() {
    let err = FluidError::invalid_tx("test message");
    assert!(matches!(err, FluidError::InvalidTransaction(msg) if msg == "test message"));
}

#[test]
fn test_fluid_error_signing_failed() {
    let err = FluidError::signing_failed("key not found");
    assert!(matches!(err, FluidError::SigningFailed(msg) if msg == "key not found"));
}

#[test]
fn test_fluid_error_xdr() {
    let err = FluidError::xdr("parse failed");
    assert!(matches!(err, FluidError::Xdr(msg) if msg == "parse failed"));
}

#[test]
fn test_fluid_error_display() {
    let err = FluidError::AlreadyFeeBumped;
    let msg = format!("{}", err);
    assert!(msg.contains("cannot fee-bump an already fee-bumped transaction"));
}

// ============================================================================
// End-to-end integration test
// ============================================================================

#[test]
fn test_full_fee_bump_flow() {
    // 1. Setup: Create a fee payer signer
    let fee_payer_secret = [0xab; 32];
    let fee_payer_public = [0xcd; 32];
    let fee_payer_keypair = Keypair::from_raw_keys(fee_payer_secret, fee_payer_public);
    let fee_payer_signer = Ed25519Signer::new(fee_payer_keypair);

    // 2. Simulate user inner transaction
    let user_public = [0x12; 32];
    let inner_hash = TransactionHash::new([0x34; 32]);
    let user_signature = DecoratedSignature::new(
        [user_public[28], user_public[29], user_public[30], user_public[31]],
        [0x56; 64],
    );

    // 3. Build fee-bump transaction
    let builder = TransactionBuilder::new()
        .base_fee(100)
        .fee_multiplier(2.0)
        .network_passphrase(NetworkPassphrase::testnet())
        .fee_payer(PublicKey::new(fee_payer_public))
        .inner_xdr("AAAA...".to_string())
        .inner_hash(inner_hash.clone())
        .add_signature(user_signature);

    // 4. Build and sign
    let operation_count = 3;
    let fee_bump_tx = builder.build(&fee_payer_signer, operation_count).unwrap();

    // 5. Verify results
    let expected_fee = (operation_count as u64 + 1) * 100 * 2; // (3+1)*100*2 = 800
    assert_eq!(fee_bump_tx.fee(), expected_fee);
    assert_eq!(fee_bump_tx.fee_payer().as_bytes(), &fee_payer_public);
    assert!(fee_bump_tx.inner_xdr().is_some());
    assert_eq!(fee_bump_tx.inner_signatures().len(), 1);

    // 6. Verify fee-bump signature
    let fee_bump_sig = fee_bump_tx.fee_bump_signature();
    assert_eq!(fee_bump_sig.hint(), fee_payer_signer.public_key().signature_hint());
    assert_eq!(fee_bump_sig.signature().len(), 64);
}

#[test]
fn test_fee_payer_round_robin_simulation() {
    // Simulate round-robin selection of fee payers
    let fee_payers: Vec<_> = (0..3)
        .map(|i| {
            let secret = [i as u8; 32];
            let public = [(i + 10) as u8; 32];
            Keypair::from_raw_keys(secret, public)
        })
        .collect();

    let mut rr_index = 0;

    for round in 0..6 {
        let selected = &fee_payers[rr_index % fee_payers.len()];
        println!("Round {}: Selected fee payer with public key {:02x?}", round, selected.public_key().as_bytes()[0]);

        rr_index = (rr_index + 1) % fee_payers.len();
    }

    // Verify round-robin cycled correctly
    assert_eq!(rr_index, 0); // After 6 rounds with 3 payers, we're back to start
}
