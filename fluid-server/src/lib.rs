use std::fmt;
use std::str::FromStr;
use std::sync::{Mutex, OnceLock};
mod blocklist;
mod heuristics;
pub mod archive;

use blocklist::Blocklist;
use heuristics::RequestTracker;
use std::time::{SystemTime, UNIX_EPOCH};

static BLOCKLIST: OnceLock<Mutex<Blocklist>> = OnceLock::new();
static TRACKER: OnceLock<Mutex<RequestTracker>> = OnceLock::new();

fn now() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        (js_sys::Date::now() / 1000.0) as u64
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }
}


use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};
use stellar_strkey::ed25519::{PrivateKey, PublicKey};
use stellar_strkey::Strkey;
use stellar_xdr::curr::{
    DecoratedSignature, Hash, Limits, MuxedAccount, Preconditions, ReadXdr, Signature,
    SignatureHint, Transaction, TransactionEnvelope, TransactionExt, TransactionSignaturePayload,
    TransactionSignaturePayloadTaggedTransaction, TransactionV0, Uint256, VecM, WriteXdr,
};
use wasm_bindgen::prelude::*;

// These modules are primarily used by the native server binary.
// We expose them from the library so unit tests + coverage tools can exercise them.
#[cfg(not(target_arch = "wasm32"))]
pub mod config;
#[cfg(not(target_arch = "wasm32"))]
pub mod error;
#[cfg(not(target_arch = "wasm32"))]
pub mod grpc;
#[cfg(not(target_arch = "wasm32"))]
pub mod logging;
#[cfg(not(target_arch = "wasm32"))]
pub mod rate_limiter;

const MAX_SIGNATURES: usize = 20;

// #695 – WASM Signing Out-Of-Memory Protections
// We impose a hard ceiling on the XDR payload size that the WASM bundle will
// process.  Excessively large XDR strings are the primary vector for
// allocator exhaustion inside a constrained WebAssembly heap.  The limit is
// set conservatively at 64 KiB – well above any realistic Stellar transaction
// envelope – and can be overridden at compile-time via the
// `FLUID_WASM_MAX_XDR_BYTES` env var (only honoured during `cargo build`,
// not at runtime, since WASM has no env access).
const MAX_XDR_BYTES: usize = 64 * 1024; // 64 KiB

/// Validates that an XDR string is within the safe byte-size limit before any
/// heap-intensive decoding is attempted.  Returns a [`SigningError`] when the
/// limit would be exceeded so callers can surface it as a clean JS exception
/// rather than an unrecoverable allocator OOM trap.
fn check_xdr_size(xdr: &str) -> Result<(), SigningError> {
    let byte_len = xdr.len();
    if byte_len > MAX_XDR_BYTES {
        return Err(SigningError::InvalidEnvelope(format!(
            "XDR payload is {byte_len} bytes, which exceeds the maximum allowed \
             size of {MAX_XDR_BYTES} bytes. This limit prevents out-of-memory \
             conditions in the WASM signing bundle."
        )));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SigningResult {
    pub signed_xdr: String,
    pub signer_public_key: String,
    pub transaction_hash_hex: String,
    pub signature_count: usize,
}

#[wasm_bindgen]
pub struct WasmSigningResult {
    signed_xdr: String,
    signer_public_key: String,
    transaction_hash_hex: String,
    signature_count: u32,
}

impl From<SigningResult> for WasmSigningResult {
    fn from(value: SigningResult) -> Self {
        Self {
            signed_xdr: value.signed_xdr,
            signer_public_key: value.signer_public_key,
            transaction_hash_hex: value.transaction_hash_hex,
            signature_count: value.signature_count as u32,
        }
    }
}

#[wasm_bindgen]
impl WasmSigningResult {
    #[wasm_bindgen(getter, js_name = signedXdr)]
    pub fn signed_xdr(&self) -> String {
        self.signed_xdr.clone()
    }

    #[wasm_bindgen(getter, js_name = signerPublicKey)]
    pub fn signer_public_key(&self) -> String {
        self.signer_public_key.clone()
    }

    #[wasm_bindgen(getter, js_name = transactionHashHex)]
    pub fn transaction_hash_hex(&self) -> String {
        self.transaction_hash_hex.clone()
    }

    #[wasm_bindgen(getter, js_name = signatureCount)]
    pub fn signature_count(&self) -> u32 {
        self.signature_count
    }
}

#[derive(Debug)]
pub enum SigningError {
    InvalidSecretKey(String),
    InvalidEnvelope(String),
    UnsupportedEnvelope(String),
    SignatureOverflow,
    AccountBlocked(String),
    SuspiciousActivity(String),
}

impl fmt::Display for SigningError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidSecretKey(message) => write!(f, "invalid Stellar secret key: {message}"),
            Self::InvalidEnvelope(message) => write!(f, "invalid transaction envelope: {message}"),
            Self::UnsupportedEnvelope(message) => write!(f, "{message}"),
            Self::SignatureOverflow => write!(
                f,
                "transaction already contains the maximum of 20 signatures"
            ),
            Self::AccountBlocked(message) => write!(f, "account is blocked: {message}"),
            Self::SuspiciousActivity(message) => write!(f, "suspicious activity detected: {message}"),
        }
    }
}

impl std::error::Error for SigningError {}

impl From<&str> for SigningError {
    fn from(s: &str) -> Self {
        Self::AccountBlocked(s.to_string())
    }
}

impl From<String> for SigningError {
    fn from(s: String) -> Self {
        Self::AccountBlocked(s)
    }
}

#[wasm_bindgen(js_name = signTransactionXdr)]
pub fn sign_transaction_xdr(
    unsigned_xdr: &str,
    secret_key: &str,
    network_passphrase: &str,
) -> Result<WasmSigningResult, JsValue> {
    // #695 – OOM protection: reject oversized payloads before heap allocation.
    check_xdr_size(unsigned_xdr).map_err(|err| JsValue::from_str(&err.to_string()))?;
    sign_transaction_xdr_internal(unsigned_xdr, secret_key, network_passphrase)
        .map(Into::into)
        .map_err(|err| JsValue::from_str(&err.to_string()))
}

#[wasm_bindgen(js_name = transactionHashHex)]
pub fn transaction_hash_hex(
    transaction_xdr: &str,
    network_passphrase: &str,
) -> Result<String, JsValue> {
    let envelope = parse_transaction_envelope(transaction_xdr)
        .map_err(|err| JsValue::from_str(&err.to_string()))?;
    let tx_hash = transaction_hash(&envelope, network_passphrase)
        .map_err(|err| JsValue::from_str(&err.to_string()))?;
    Ok(hex::encode(tx_hash))
}

#[wasm_bindgen(js_name = publicKeyFromSecret)]
pub fn public_key_from_secret(secret_key: &str) -> Result<String, JsValue> {
    signer_context(secret_key)
        .map(|context| context.public_key)
        .map_err(|err| JsValue::from_str(&err.to_string()))
}

pub fn sign_transaction_xdr_internal(
    unsigned_xdr: &str,
    secret_key: &str,
    network_passphrase: &str,
) -> Result<SigningResult, SigningError> {
    // #695 – OOM protection: enforce size ceiling before any decoding.
    check_xdr_size(unsigned_xdr)?;
    let signer = signer_context(secret_key)?;

    let public_key = signer.public_key.clone();
    let blocklist = BLOCKLIST.get_or_init(|| Mutex::new(Blocklist::new()));
    let tracker = TRACKER.get_or_init(|| Mutex::new(RequestTracker::new()));

    {
        let blocklist_guard = blocklist
            .lock()
            .map_err(|_| SigningError::SuspiciousActivity("blocklist lock poisoned".to_string()))?;
        if blocklist_guard.is_blocked(&public_key, now()) {
            return Err("Account is blocked".into());
        }
    }

    let suspicious = {
        let mut tracker_guard = tracker
            .lock()
            .map_err(|_| SigningError::SuspiciousActivity("tracker lock poisoned".to_string()))?;
        tracker_guard.is_suspicious(&public_key, now())
    };

    if suspicious {
        let mut blocklist_guard = blocklist
            .lock()
            .map_err(|_| SigningError::SuspiciousActivity("blocklist lock poisoned".to_string()))?;
        blocklist_guard.add(
            public_key.clone(),
            "Suspicious activity detected".to_string(),
            now(),
        );
        return Err("Account flagged and blocked".into());
    }

    let mut envelope = parse_transaction_envelope(unsigned_xdr)?;
    let tx_hash = transaction_hash(&envelope, network_passphrase)?;
    let signed_envelope = append_signature(&mut envelope, &signer, &tx_hash)?;

    Ok(SigningResult {
        signed_xdr: signed_envelope,
        signer_public_key: signer.public_key,
        transaction_hash_hex: hex::encode(tx_hash),
        signature_count: envelope_signature_count(&envelope),
    })
}

#[derive(Debug)]
struct SignerContext {
    signing_key: SigningKey,
    public_key: String,
    public_key_bytes: [u8; 32],
}

fn signer_context(secret_key: &str) -> Result<SignerContext, SigningError> {
    let raw_secret = PrivateKey::from_str(secret_key)
        .map_err(|err| SigningError::InvalidSecretKey(err.to_string()))?
        .0;
    let signing_key = SigningKey::from_bytes(&raw_secret);
    let public_key_bytes = signing_key.verifying_key().to_bytes();
    let public_key = Strkey::PublicKeyEd25519(PublicKey(public_key_bytes))
        .to_string()
        .to_string();

    Ok(SignerContext {
        signing_key,
        public_key,
        public_key_bytes,
    })
}

fn parse_transaction_envelope(transaction_xdr: &str) -> Result<TransactionEnvelope, SigningError> {
    TransactionEnvelope::from_xdr_base64(transaction_xdr, Limits::none())
        .map_err(|err| SigningError::InvalidEnvelope(err.to_string()))
}

fn transaction_hash(
    envelope: &TransactionEnvelope,
    network_passphrase: &str,
) -> Result<[u8; 32], SigningError> {
    let tagged_transaction = match envelope {
        TransactionEnvelope::Tx(tx_envelope) => {
            TransactionSignaturePayloadTaggedTransaction::Tx(tx_envelope.tx.clone())
        }
        TransactionEnvelope::TxV0(tx_envelope) => TransactionSignaturePayloadTaggedTransaction::Tx(
            convert_v0_transaction(&tx_envelope.tx),
        ),
        TransactionEnvelope::TxFeeBump(_) => {
            return Err(SigningError::UnsupportedEnvelope(
                "fee-bump envelopes are already wrapped; sign the inner transaction before fee-bumping".to_string(),
            ));
        }
    };

    let payload = TransactionSignaturePayload {
        network_id: Hash(sha256(network_passphrase.as_bytes())),
        tagged_transaction,
    };
    let payload_xdr = payload
        .to_xdr(Limits::none())
        .map_err(|err| SigningError::InvalidEnvelope(err.to_string()))?;

    Ok(sha256(payload_xdr))
}

fn convert_v0_transaction(tx: &TransactionV0) -> Transaction {
    let cond = match tx.time_bounds.clone() {
        Some(time_bounds) => Preconditions::Time(time_bounds),
        None => Preconditions::None,
    };

    Transaction {
        source_account: MuxedAccount::Ed25519(Uint256(tx.source_account_ed25519.0)),
        fee: tx.fee,
        seq_num: tx.seq_num.clone(),
        cond,
        memo: tx.memo.clone(),
        operations: tx.operations.clone(),
        ext: TransactionExt::V0,
    }
}

fn append_signature(
    envelope: &mut TransactionEnvelope,
    signer: &SignerContext,
    tx_hash: &[u8; 32],
) -> Result<String, SigningError> {
    let signature = signer.signing_key.sign(tx_hash).to_bytes().to_vec();
    let decorated_signature = DecoratedSignature {
        hint: SignatureHint(signature_hint(&signer.public_key_bytes)),
        signature: Signature::try_from(signature)
            .map_err(|err| SigningError::InvalidEnvelope(err.to_string()))?,
    };

    match envelope {
        TransactionEnvelope::Tx(tx_envelope) => {
            tx_envelope.signatures =
                push_signature(&tx_envelope.signatures, decorated_signature.clone())?;
        }
        TransactionEnvelope::TxV0(tx_envelope) => {
            tx_envelope.signatures = push_signature(&tx_envelope.signatures, decorated_signature)?;
        }
        TransactionEnvelope::TxFeeBump(_) => {
            return Err(SigningError::UnsupportedEnvelope(
                "fee-bump envelopes are not supported by the signing WASM entrypoint".to_string(),
            ));
        }
    }

    envelope
        .to_xdr_base64(Limits::none())
        .map_err(|err| SigningError::InvalidEnvelope(err.to_string()))
}

fn push_signature(
    signatures: &VecM<DecoratedSignature, 20>,
    signature: DecoratedSignature,
) -> Result<VecM<DecoratedSignature, 20>, SigningError> {
    if signatures.len() >= MAX_SIGNATURES {
        return Err(SigningError::SignatureOverflow);
    }

    let mut signature_list = signatures.to_vec();
    signature_list.push(signature);
    signature_list
        .try_into()
        .map_err(|_| SigningError::SignatureOverflow)
}

fn envelope_signature_count(envelope: &TransactionEnvelope) -> usize {
    match envelope {
        TransactionEnvelope::Tx(tx_envelope) => tx_envelope.signatures.len(),
        TransactionEnvelope::TxV0(tx_envelope) => tx_envelope.signatures.len(),
        TransactionEnvelope::TxFeeBump(tx_envelope) => tx_envelope.signatures.len(),
    }
}

fn signature_hint(public_key: &[u8; 32]) -> [u8; 4] {
    [
        public_key[28],
        public_key[29],
        public_key[30],
        public_key[31],
    ]
}

fn sha256(input: impl AsRef<[u8]>) -> [u8; 32] {
    let digest = Sha256::digest(input);
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&digest);
    hash
}

#[cfg(test)]
mod tests {
    use super::*;
    use stellar_xdr::curr::{DecoratedSignature, Signature, SignatureHint, VecM};

    const TEST_NETWORK_PASSPHRASE: &str = "Test SDF Network ; September 2015";
    const TEST_SECRET_KEY: &str = "SDMOYUZMPBA5SDXYC7346UPSFC3LA2QSHWI67M7ZW6G2D55TJ2H3A4IE";
    const TEST_PUBLIC_KEY: &str = "GCF5JWV2NUPVYS3Y7OJNK6GIL7VCRZRY6BAAVLLDS47NKIB2PDVDZNMX";
    const UNSIGNED_XDR: &str = "AAAAAgAAAACL1Nq6bR9cS3j7ktV4yF/qKOY48EAKrWOXPtUgOnjqPAAAAGQAAAAAB1vNFgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAApmbHVpZC13YXNtAAAAAAABAAAAAAAAAAEAAAAAbO4GWuFhrzZ6zHFGQvDxcMZkSolm7txyO8Uc1nvfqWcAAAAAAAAAAAC8YU4AAAAAAAAAAA==";
    const SIGNED_XDR: &str = "AAAAAgAAAACL1Nq6bR9cS3j7ktV4yF/qKOY48EAKrWOXPtUgOnjqPAAAAGQAAAAAB1vNFgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAApmbHVpZC13YXNtAAAAAAABAAAAAAAAAAEAAAAAbO4GWuFhrzZ6zHFGQvDxcMZkSolm7txyO8Uc1nvfqWcAAAAAAAAAAAC8YU4AAAAAAAAAATp46jwAAABAjQnVuBt3qlFlGpktPNGOTW6KQOsocZ/L4VOmmJFKGf+kuc1AegprsHX3Tc4OAqBYBTiwu4bXj/jo+3dfxPSwAA==";
    const TX_HASH_HEX: &str = "a5696ec2ee3daba151f203513532c83b2f415b9ede821a195a90176ffee79b8a";

    #[test]
    fn derives_the_expected_public_key() {
        let signer = signer_context(TEST_SECRET_KEY).unwrap();
        assert_eq!(signer.public_key, TEST_PUBLIC_KEY);
    }

    #[test]
    fn signs_the_fixture_transaction_like_the_js_sdk() {
        let result =
            sign_transaction_xdr_internal(UNSIGNED_XDR, TEST_SECRET_KEY, TEST_NETWORK_PASSPHRASE)
                .unwrap();

        assert_eq!(result.signed_xdr, SIGNED_XDR);
        assert_eq!(result.signer_public_key, TEST_PUBLIC_KEY);
        assert_eq!(result.transaction_hash_hex, TX_HASH_HEX);
        assert_eq!(result.signature_count, 1);
    }

    #[test]
    fn rejects_invalid_secret_keys() {
        let error = signer_context("not-a-secret").unwrap_err();
        let message = error.to_string();

        assert!(message.contains("invalid Stellar secret key"));
    }

    #[test]
    fn public_key_wrapper_returns_expected_key() {
        let public_key = public_key_from_secret(TEST_SECRET_KEY).unwrap();
        assert_eq!(public_key, TEST_PUBLIC_KEY);
    }

    #[test]
    fn transaction_hash_wrapper_matches_fixture_hash() {
        let tx_hash = transaction_hash_hex(UNSIGNED_XDR, TEST_NETWORK_PASSPHRASE).unwrap();
        assert_eq!(tx_hash, TX_HASH_HEX);
    }

    #[test]
    fn wasm_wrapper_signs_fixture_transaction() {
        let result = sign_transaction_xdr(UNSIGNED_XDR, TEST_SECRET_KEY, TEST_NETWORK_PASSPHRASE)
            .expect("wasm-compatible wrapper should sign the fixture XDR");

        assert_eq!(result.signed_xdr(), SIGNED_XDR);
        assert_eq!(result.signer_public_key(), TEST_PUBLIC_KEY);
        assert_eq!(result.transaction_hash_hex(), TX_HASH_HEX);
        assert_eq!(result.signature_count(), 1);
    }

    #[test]
    fn parse_transaction_envelope_rejects_invalid_xdr() {
        let error = parse_transaction_envelope("not-base64").unwrap_err();
        assert!(matches!(error, SigningError::InvalidEnvelope(_)));
    }

    #[test]
    fn helper_functions_produce_expected_values() {
        let signer = signer_context(TEST_SECRET_KEY).unwrap();
        let envelope = parse_transaction_envelope(SIGNED_XDR).unwrap();

        assert_eq!(envelope_signature_count(&envelope), 1);
        assert_eq!(
            signature_hint(&signer.public_key_bytes),
            [0x3A, 0x78, 0xEA, 0x3C]
        );
        assert_eq!(
            hex::encode(sha256("fluid")),
            "5e0502adfb96f1f1544d24f00c99b269c12570acfd994666ffb86424e0835370"
        );
    }

    #[test]
    fn transaction_hash_matches_internal_fixture_hash() {
        let envelope = parse_transaction_envelope(UNSIGNED_XDR).unwrap();
        let tx_hash = transaction_hash(&envelope, TEST_NETWORK_PASSPHRASE).unwrap();

        assert_eq!(hex::encode(tx_hash), TX_HASH_HEX);
    }

    #[test]
    fn push_signature_rejects_overflow() {
        let existing: VecM<DecoratedSignature, 20> = (0..20)
            .map(|_| DecoratedSignature {
                hint: SignatureHint([0, 0, 0, 0]),
                signature: Signature(vec![1u8; 64].try_into().unwrap()),
            })
            .collect::<Vec<_>>()
            .try_into()
            .unwrap();

        let result = push_signature(
            &existing,
            DecoratedSignature {
                hint: SignatureHint([1, 2, 3, 4]),
                signature: Signature(vec![2u8; 64].try_into().unwrap()),
            },
        );

        assert!(matches!(result, Err(SigningError::SignatureOverflow)));
    }

    #[test]
    fn signature_hint_uses_last_4_bytes() {
        let bytes = [
            0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
            24, 25, 26, 27, 28, 29, 30, 31,
        ];
        assert_eq!(signature_hint(&bytes), [28, 29, 30, 31]);
    }

    #[test]
    fn sha256_produces_expected_digest() {
        // Known SHA-256("abc") test vector.
        let digest = sha256(b"abc");
        assert_eq!(
            hex::encode(digest),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn envelope_signature_count_counts_all_envelope_variants() {
        let mut env = parse_transaction_envelope(UNSIGNED_XDR).unwrap();
        assert_eq!(envelope_signature_count(&env), 0);

        // Append a signature and ensure count increments.
        let signer = signer_context(TEST_SECRET_KEY).unwrap();
        let tx_hash = transaction_hash(&env, TEST_NETWORK_PASSPHRASE).unwrap();
        let _ = append_signature(&mut env, &signer, &tx_hash).unwrap();
        assert_eq!(envelope_signature_count(&env), 1);
    }

    #[test]
    fn push_signature_appends_when_under_limit() {
        let signatures: VecM<DecoratedSignature, 20> = Vec::<DecoratedSignature>::new()
            .try_into()
            .expect("empty vec should fit");
        let decorated = DecoratedSignature {
            hint: SignatureHint([0, 0, 0, 0]),
            signature: Signature(
                vec![1u8, 2, 3, 4]
                    .try_into()
                    .expect("signature bytes should fit BytesM<64>"),
            ),
        };
        let updated = push_signature(&signatures, decorated).unwrap();
        assert_eq!(updated.len(), 1);
    }

    // #695 – WASM OOM protection tests
    #[test]
    fn check_xdr_size_accepts_valid_payload() {
        // Fixture XDR is well under 64 KiB
        assert!(check_xdr_size(UNSIGNED_XDR).is_ok());
    }

    #[test]
    fn check_xdr_size_rejects_oversized_payload() {
        let huge = "A".repeat(MAX_XDR_BYTES + 1);
        let err = check_xdr_size(&huge).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("exceeds the maximum allowed size"), "msg: {msg}");
    }

    #[test]
    fn check_xdr_size_accepts_exact_limit() {
        let at_limit = "A".repeat(MAX_XDR_BYTES);
        assert!(check_xdr_size(&at_limit).is_ok());
    }

    #[test]
    fn sign_transaction_xdr_internal_rejects_oversized_xdr() {
        let huge = "A".repeat(MAX_XDR_BYTES + 1);
        let err = sign_transaction_xdr_internal(&huge, TEST_SECRET_KEY, TEST_NETWORK_PASSPHRASE)
            .unwrap_err();
        assert!(matches!(err, SigningError::InvalidEnvelope(_)));
    }
}