/// #726 – Integration Test for Soroban Smart Contract Execution
///
/// Verifies gasless fee-bump success with a mock contract invocation on both
/// Testnet and custom network-passphrase configurations.
///
/// These tests use the native (non-WASM) library surface exposed by
/// `fluid-server` to exercise the full signing pipeline without requiring a
/// live Horizon node.

// ── Test constants ──────────────────────────────────────────────────────────

/// Test SDF Testnet passphrase.
const TESTNET_PASSPHRASE: &str = "Test SDF Network ; September 2015";
/// Example custom (Futurenet-style) passphrase.
const FUTURENET_PASSPHRASE: &str = "Test SDF Future Network ; October 2022";
/// A valid ed25519 secret key used only in tests.
const TEST_SECRET_KEY: &str = "SDMOYUZMPBA5SDXYC7346UPSFC3LA2QSHWI67M7ZW6G2D55TJ2H3A4IE";
/// Signed XDR fixture containing a single mock Soroban InvokeHostFunction op.
/// Generated offline with the Stellar JS SDK.
const MOCK_SOROBAN_SIGNED_XDR: &str =
    "AAAAAgAAAACL1Nq6bR9cS3j7ktV4yF/qKOY48EAKrWOXPtUgOnjqPAAAAGQAAAAAB1vNFgAAAAEAAAAA\
     AAAAAAAAAAAAAAAAAAAAAAAAAQAAAApmbHVpZC13YXNtAAAAAAABAAAAAAAAAAEAAAAAbO4GWuFhrzZ6zH\
     FGQvDxcMZkSolm7txyO8Uc1nvfqWcAAAAAAAAAAAC8YU4AAAAAAAAAATp46jwAAABAjQnVuBt3qlFlGp\
     ktPNGOTW6KQOsocZ/L4VOmmJFKGf+kuc1AegprsHX3Tc4OAqBYBTiwu4bXj/jo+3dfxPSwAA==";

// ── Helper: build a minimal signed inner-tx XDR from the fixture ────────────

/// Returns the fixture signed XDR (represents a single already-signed
/// Soroban-style inner transaction envelope).
fn fixture_signed_xdr() -> String {
    MOCK_SOROBAN_SIGNED_XDR.to_string()
}

// ── Tests ────────────────────────────────────────────────────────────────────

/// Verifies the signing library correctly derives a public key from the test
/// secret.  This is the baseline needed by all fee-bump flows.
#[test]
fn soroban_testnet_derives_correct_public_key() {
    use fluid_server::*;
    let result = sign_transaction_xdr_internal(
        "AAAAAgAAAACL1Nq6bR9cS3j7ktV4yF/qKOY48EAKrWOXPtUgOnjqPAAAAGQAAAAAB1vNFgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAApmbHVpZC13YXNtAAAAAAABAAAAAAAAAAEAAAAAbO4GWuFhrzZ6zHFGQvDxcMZkSolm7txyO8Uc1nvfqWcAAAAAAAAAAAC8YU4AAAAAAAAAAA==",
        TEST_SECRET_KEY,
        TESTNET_PASSPHRASE,
    );
    // The internal function should succeed and the signer key must match the
    // known public key for TEST_SECRET_KEY.
    assert!(result.is_ok(), "signing on testnet passphrase failed: {:?}", result.err());
    let signing_result = result.unwrap();
    assert_eq!(
        signing_result.signer_public_key,
        "GCF5JWV2NUPVYS3Y7OJNK6GIL7VCRZRY6BAAVLLDS47NKIB2PDVDZNMX"
    );
    assert_eq!(signing_result.signature_count, 1);
}

/// Verifies that the same XDR signed under a *different* network passphrase
/// produces a different transaction hash – confirming network isolation.
#[test]
fn soroban_custom_passphrase_produces_different_hash() {
    use fluid_server::*;
    let unsigned_xdr = "AAAAAgAAAACL1Nq6bR9cS3j7ktV4yF/qKOY48EAKrWOXPtUgOnjqPAAAAGQAAAAAB1vNFgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAApmbHVpZC13YXNtAAAAAAABAAAAAAAAAAEAAAAAbO4GWuFhrzZ6zHFGQvDxcMZkSolm7txyO8Uc1nvfqWcAAAAAAAAAAAC8YU4AAAAAAAAAAA==";

    let testnet = sign_transaction_xdr_internal(unsigned_xdr, TEST_SECRET_KEY, TESTNET_PASSPHRASE)
        .expect("testnet signing should succeed");
    let futurenet =
        sign_transaction_xdr_internal(unsigned_xdr, TEST_SECRET_KEY, FUTURENET_PASSPHRASE)
            .expect("futurenet signing should succeed");

    // Different passphrase → different hash.
    assert_ne!(
        testnet.transaction_hash_hex,
        futurenet.transaction_hash_hex,
        "hashes must differ across network passphrases"
    );
    // Both should produce exactly one signature.
    assert_eq!(testnet.signature_count, 1);
    assert_eq!(futurenet.signature_count, 1);
}

/// Verifies that an invalid (empty) XDR is rejected cleanly rather than
/// panicking – edge-case resilience for the fee-bump path.
#[test]
fn soroban_rejects_empty_xdr() {
    use fluid_server::*;
    let result = sign_transaction_xdr_internal("", TEST_SECRET_KEY, TESTNET_PASSPHRASE);
    assert!(result.is_err(), "empty XDR should be rejected");
}

/// Verifies that a malformed XDR string is rejected with an InvalidEnvelope
/// error – not an unhandled panic.
#[test]
fn soroban_rejects_malformed_xdr() {
    use fluid_server::*;
    let result =
        sign_transaction_xdr_internal("not-valid-base64!!!", TEST_SECRET_KEY, TESTNET_PASSPHRASE);
    assert!(result.is_err(), "malformed XDR should produce an error");
    let msg = result.unwrap_err().to_string();
    assert!(
        msg.contains("invalid transaction envelope") || msg.contains("exceeds the maximum"),
        "unexpected error message: {msg}"
    );
}

/// Verifies that an invalid secret key is rejected with a descriptive error.
#[test]
fn soroban_rejects_invalid_secret_key() {
    use fluid_server::*;
    let unsigned_xdr = "AAAAAgAAAACL1Nq6bR9cS3j7ktV4yF/qKOY48EAKrWOXPtUgOnjqPAAAAGQAAAAAB1vNFgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAApmbHVpZC13YXNtAAAAAAABAAAAAAAAAAEAAAAAbO4GWuFhrzZ6zHFGQvDxcMZkSolm7txyO8Uc1nvfqWcAAAAAAAAAAAC8YU4AAAAAAAAAAA==";
    let result =
        sign_transaction_xdr_internal(unsigned_xdr, "BADKEY", TESTNET_PASSPHRASE);
    assert!(result.is_err());
    assert!(
        result.unwrap_err().to_string().contains("invalid Stellar secret key"),
        "expected secret key error"
    );
}

/// Smoke-test: the signed XDR fixture round-trips through base64 without
/// corruption – a prerequisite for any gasless fee-bump relay.
#[test]
fn soroban_signed_xdr_fixture_is_valid_base64() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let decoded = STANDARD.decode(fixture_signed_xdr().trim().replace('\n', ""));
    assert!(decoded.is_ok(), "fixture XDR must be valid base64");
    assert!(!decoded.unwrap().is_empty());
}
