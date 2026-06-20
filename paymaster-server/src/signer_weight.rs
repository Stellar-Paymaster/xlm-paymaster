//! Pre-flight validation of inner transaction signature weight (#686).
//!
//! Before wrapping an inner transaction in a fee-bump envelope, the relay verifies
//! that the signatures on the inner envelope meet the source account's
//! `med_threshold` (Stellar's requirement for submitting operations).

use axum::http::StatusCode;
use serde::Deserialize;
use stellar_strkey::{ed25519::PublicKey, Strkey};
use stellar_xdr::curr::{
    DecoratedSignature, SignatureHint, TransactionEnvelope,
    TransactionV1Envelope,
};

use crate::error::AppError;

#[derive(Debug, Clone, Deserialize)]
pub struct AccountThresholds {
    pub low_threshold: u32,
    pub med_threshold: u32,
    pub high_threshold: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HorizonSigner {
    pub key: String,
    pub weight: u32,
    #[serde(rename = "type")]
    pub signer_type: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HorizonAccountAuth {
    pub thresholds: AccountThresholds,
    pub signers: Vec<HorizonSigner>,
}

#[derive(Debug)]
pub enum SignerWeightError {
    InsufficientWeight { actual: u32, required: u32 },
    UnsupportedSourceAccount,
    NoMatchingSigners,
}

impl SignerWeightError {
    pub fn into_app_error(self) -> AppError {
        match self {
            Self::InsufficientWeight { actual, required } => AppError::new(
                StatusCode::BAD_REQUEST,
                "INSUFFICIENT_SIGNATURE_WEIGHT",
                format!(
                    "Inner transaction signature weight ({actual}) is below the source \
                     account med_threshold ({required})"
                ),
            ),
            Self::UnsupportedSourceAccount => AppError::new(
                StatusCode::BAD_REQUEST,
                "UNSUPPORTED_SOURCE_ACCOUNT",
                "Source account type is not supported for signer-weight validation",
            ),
            Self::NoMatchingSigners => AppError::new(
                StatusCode::BAD_REQUEST,
                "INSUFFICIENT_SIGNATURE_WEIGHT",
                "Inner transaction signatures do not match any configured account signers",
            ),
        }
    }
}

/// Compute the total signature weight contributed by `signatures` against `account`.
pub fn total_signature_weight(
    signatures: &[DecoratedSignature],
    account: &HorizonAccountAuth,
) -> Result<u32, SignerWeightError> {
    if signatures.is_empty() {
        return Ok(0);
    }

    let mut total = 0u32;
    let mut matched_any = false;

    for signature in signatures {
        let Some(weight) = weight_for_hint(&signature.hint, account) else {
            continue;
        };
        matched_any = true;
        total = total.saturating_add(weight);
    }

    if !matched_any {
        return Err(SignerWeightError::NoMatchingSigners);
    }

    Ok(total)
}

/// Validate that a classic V1 inner envelope meets the source account `med_threshold`.
pub fn validate_inner_envelope_signer_weight(
    inner: &TransactionV1Envelope,
    account: &HorizonAccountAuth,
) -> Result<(), SignerWeightError> {
    let required = account.thresholds.med_threshold;
    let actual = total_signature_weight(&inner.signatures, account)?;

    if actual < required {
        return Err(SignerWeightError::InsufficientWeight { actual, required });
    }

    Ok(())
}

/// Validate signer weight for a parsed transaction envelope about to be fee-bumped.
pub fn validate_transaction_envelope_signer_weight(
    envelope: &TransactionEnvelope,
    account: &HorizonAccountAuth,
) -> Result<(), SignerWeightError> {
    match envelope {
        TransactionEnvelope::Tx(inner) => validate_inner_envelope_signer_weight(inner, account),
        TransactionEnvelope::TxV0(_) => Err(SignerWeightError::UnsupportedSourceAccount),
        TransactionEnvelope::TxFeeBump(_) => Err(SignerWeightError::UnsupportedSourceAccount),
    }
}

fn weight_for_hint(hint: &SignatureHint, account: &HorizonAccountAuth) -> Option<u32> {
    for signer in &account.signers {
        if signer.signer_type != "ed25519_public_key" {
            continue;
        }
        let Ok(Strkey::PublicKeyEd25519(PublicKey(bytes))) = Strkey::from_string(&signer.key)
        else {
            continue;
        };
        if signature_hint_matches(&bytes, hint) {
            return Some(signer.weight);
        }
    }
    None
}

fn signature_hint_matches(public_key: &[u8; 32], hint: &SignatureHint) -> bool {
    hint.0 == [
        public_key[28],
        public_key[29],
        public_key[30],
        public_key[31],
    ]
}

/// Extract the classic ed25519 account id (G...) from a fee-bump inner envelope.
///
/// Supports both plain `Ed25519` source accounts and `MuxedEd25519` (M...)
/// accounts — for the latter the underlying ed25519 key is extracted so that
/// Horizon can be queried for the base account's thresholds and signers.
pub fn inner_source_account_id(inner: &TransactionV1Envelope) -> Result<String, SignerWeightError> {
    muxed_account_to_account_id(&inner.tx.source_account)
}

/// Resolve a [`MuxedAccount`] to its underlying classic G... account id.
///
/// * `Ed25519` — returned directly.
/// * `MuxedEd25519` — the embedded ed25519 key is extracted; the mux id is
///   discarded because Horizon account lookups always use the base account.
pub fn muxed_account_to_account_id(
    account: &stellar_xdr::curr::MuxedAccount,
) -> Result<String, SignerWeightError> {
    use stellar_xdr::curr::MuxedAccount;
    match account {
        MuxedAccount::Ed25519(key) => Ok(Strkey::PublicKeyEd25519(PublicKey(key.0)).to_string().as_str().to_string()),
        MuxedAccount::MuxedEd25519(muxed) => {
            // Extract the underlying 32-byte ed25519 key from the muxed account.
            Ok(Strkey::PublicKeyEd25519(PublicKey(muxed.ed25519.0)).to_string().as_str().to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};
    use stellar_xdr::curr::{
        Asset, Hash, Limits, Memo, MuxedAccount, Operation, OperationBody, PaymentOp,
        Preconditions, SequenceNumber, Signature, Transaction, TransactionExt,
        TransactionSignaturePayload, TransactionSignaturePayloadTaggedTransaction, Uint256,
        WriteXdr,
    };

    fn test_account(master_weight: u32, med_threshold: u32) -> (String, HorizonAccountAuth) {
        let secret = [11_u8; 32];
        let signing_key = SigningKey::from_bytes(&secret);
        let public_bytes = signing_key.verifying_key().to_bytes();
        let account_id = Strkey::PublicKeyEd25519(PublicKey(public_bytes))
            .to_string()
            .to_string();

        let auth = HorizonAccountAuth {
            thresholds: AccountThresholds {
                low_threshold: 0,
                med_threshold,
                high_threshold: 255,
            },
            signers: vec![HorizonSigner {
                key: account_id.clone(),
                weight: master_weight,
                signer_type: "ed25519_public_key".to_string(),
            }],
        };

        (account_id, auth)
    }

    fn sign_v1_envelope(
        tx: Transaction,
        signing_key: &SigningKey,
        network_passphrase: &str,
    ) -> TransactionV1Envelope {
        let source = match &tx.source_account {
            MuxedAccount::Ed25519(key) => key.0,
            _ => [0u8; 32],
        };
        let network_hash: [u8; 32] = Sha256::digest(network_passphrase.as_bytes()).into();
        let payload = TransactionSignaturePayload {
            network_id: Hash(network_hash),
            tagged_transaction: TransactionSignaturePayloadTaggedTransaction::Tx(tx.clone()),
        };
        let payload_xdr = payload.to_xdr(Limits::none()).unwrap();
        let tx_hash: [u8; 32] = Sha256::digest(payload_xdr).into();
        let signature = signing_key.sign(&tx_hash).to_bytes();

        TransactionV1Envelope {
            tx,
            signatures: vec![DecoratedSignature {
                hint: SignatureHint([source[28], source[29], source[30], source[31]]),
                signature: Signature(signature.to_vec().try_into().unwrap()),
            }]
            .try_into()
            .unwrap(),
        }
    }

    #[test]
    fn accepts_when_signature_weight_meets_med_threshold() {
        let (_account_id, auth) = test_account(2, 2);
        let secret = [11_u8; 32];
        let signing_key = SigningKey::from_bytes(&secret);
        let public_bytes = signing_key.verifying_key().to_bytes();
        let tx = Transaction {
            source_account: MuxedAccount::Ed25519(Uint256(public_bytes)),
            fee: 100,
            seq_num: SequenceNumber(1),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![Operation {
                source_account: None,
                body: OperationBody::Payment(PaymentOp {
                    destination: MuxedAccount::Ed25519(Uint256([2u8; 32])),
                    asset: Asset::Native,
                    amount: 1,
                }),
            }]
            .try_into()
            .unwrap(),
            ext: TransactionExt::V0,
        };

        let inner = sign_v1_envelope(tx, &signing_key, "Test SDF Network ; September 2015");
        assert!(validate_inner_envelope_signer_weight(&inner, &auth).is_ok());
    }

    #[test]
    fn rejects_when_signature_weight_below_med_threshold() {
        let (_account_id, auth) = test_account(1, 2);
        let secret = [11_u8; 32];
        let signing_key = SigningKey::from_bytes(&secret);
        let public_bytes = signing_key.verifying_key().to_bytes();
        let tx = Transaction {
            source_account: MuxedAccount::Ed25519(Uint256(public_bytes)),
            fee: 100,
            seq_num: SequenceNumber(1),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![Operation {
                source_account: None,
                body: OperationBody::Payment(PaymentOp {
                    destination: MuxedAccount::Ed25519(Uint256([2u8; 32])),
                    asset: Asset::Native,
                    amount: 1,
                }),
            }]
            .try_into()
            .unwrap(),
            ext: TransactionExt::V0,
        };

        let inner = sign_v1_envelope(tx, &signing_key, "Test SDF Network ; September 2015");
        let err = validate_inner_envelope_signer_weight(&inner, &auth).unwrap_err();
        assert!(matches!(
            err,
            SignerWeightError::InsufficientWeight {
                actual: 1,
                required: 2
            }
        ));
    }

    #[test]
    fn rejects_when_no_signature_matches_account_signers() {
        let (_account_id, auth) = test_account(1, 1);
        let other_secret = [22_u8; 32];
        let other_key = SigningKey::from_bytes(&other_secret);
        let other_public = other_key.verifying_key().to_bytes();

        let tx = Transaction {
            source_account: MuxedAccount::Ed25519(Uint256([99u8; 32])),
            fee: 100,
            seq_num: SequenceNumber(1),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![Operation {
                source_account: None,
                body: OperationBody::Payment(PaymentOp {
                    destination: MuxedAccount::Ed25519(Uint256([2u8; 32])),
                    asset: Asset::Native,
                    amount: 1,
                }),
            }]
            .try_into()
            .unwrap(),
            ext: TransactionExt::V0,
        };

        let inner = sign_v1_envelope(tx, &other_key, "Test SDF Network ; September 2015");
        assert_eq!(inner.tx.source_account, MuxedAccount::Ed25519(Uint256([99u8; 32])));
        let _ = other_public;
        let err = validate_inner_envelope_signer_weight(&inner, &auth).unwrap_err();
        assert!(matches!(err, SignerWeightError::NoMatchingSigners));
    }

    #[test]
    fn muxed_account_resolves_to_base_account_id() {
        use stellar_xdr::curr::{MuxedAccountMed25519, VecM};
        let secret = [11_u8; 32];
        let signing_key = SigningKey::from_bytes(&secret);
        let public_bytes = signing_key.verifying_key().to_bytes();

        // Build a transaction whose source is a MuxedEd25519 account.
        let tx = Transaction {
            source_account: stellar_xdr::curr::MuxedAccount::MuxedEd25519(
                MuxedAccountMed25519 {
                    id: 42,
                    ed25519: Uint256(public_bytes),
                },
            ),
            fee: 100,
            seq_num: SequenceNumber(1),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![Operation {
                source_account: None,
                body: OperationBody::Payment(PaymentOp {
                    destination: MuxedAccount::Ed25519(Uint256([2u8; 32])),
                    asset: Asset::Native,
                    amount: 1,
                }),
            }]
            .try_into()
            .unwrap(),
            ext: TransactionExt::V0,
        };

        let inner = TransactionV1Envelope {
            tx,
            signatures: VecM::default(),
        };

        // inner_source_account_id must return the base G... key, not an error.
        let account_id = inner_source_account_id(&inner).expect("muxed account should resolve");
        // The resolved id must be a valid G... address.
        assert!(account_id.starts_with('G'), "expected G... address, got {account_id}");
        // And it must match the underlying ed25519 key.
        let expected = Strkey::PublicKeyEd25519(PublicKey(public_bytes)).to_string().as_str().to_string();
        assert_eq!(account_id, expected);
    }

    #[test]
    fn sums_weights_from_multiple_signers() {
        let secret_a = [31_u8; 32];
        let secret_b = [32_u8; 32];
        let key_a = SigningKey::from_bytes(&secret_a);
        let key_b = SigningKey::from_bytes(&secret_b);
        let id_a = Strkey::PublicKeyEd25519(PublicKey(key_a.verifying_key().to_bytes()))
            .to_string()
            .to_string();
        let id_b = Strkey::PublicKeyEd25519(PublicKey(key_b.verifying_key().to_bytes()))
            .to_string()
            .to_string();

        let auth = HorizonAccountAuth {
            thresholds: AccountThresholds {
                low_threshold: 0,
                med_threshold: 3,
                high_threshold: 5,
            },
            signers: vec![
                HorizonSigner {
                    key: id_a.clone(),
                    weight: 1,
                    signer_type: "ed25519_public_key".to_string(),
                },
                HorizonSigner {
                    key: id_b.clone(),
                    weight: 2,
                    signer_type: "ed25519_public_key".to_string(),
                },
            ],
        };

        let tx = Transaction {
            source_account: MuxedAccount::Ed25519(Uint256(key_a.verifying_key().to_bytes())),
            fee: 100,
            seq_num: SequenceNumber(1),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![Operation {
                source_account: None,
                body: OperationBody::Payment(PaymentOp {
                    destination: MuxedAccount::Ed25519(Uint256([2u8; 32])),
                    asset: Asset::Native,
                    amount: 1,
                }),
            }]
            .try_into()
            .unwrap(),
            ext: TransactionExt::V0,
        };

        let network_hash: [u8; 32] =
            Sha256::digest("Test SDF Network ; September 2015".as_bytes()).into();
        let payload = TransactionSignaturePayload {
            network_id: Hash(network_hash),
            tagged_transaction: TransactionSignaturePayloadTaggedTransaction::Tx(tx.clone()),
        };
        let tx_hash: [u8; 32] = Sha256::digest(payload.to_xdr(Limits::none()).unwrap()).into();

        let bytes_a = key_a.verifying_key().to_bytes();
        let bytes_b = key_b.verifying_key().to_bytes();
        let sig_a = key_a.sign(&tx_hash).to_bytes();
        let sig_b = key_b.sign(&tx_hash).to_bytes();

        let inner = TransactionV1Envelope {
            tx,
            signatures: vec![
                DecoratedSignature {
                    hint: SignatureHint([bytes_a[28], bytes_a[29], bytes_a[30], bytes_a[31]]),
                    signature: Signature(sig_a.to_vec().try_into().unwrap()),
                },
                DecoratedSignature {
                    hint: SignatureHint([bytes_b[28], bytes_b[29], bytes_b[30], bytes_b[31]]),
                    signature: Signature(sig_b.to_vec().try_into().unwrap()),
                },
            ]
            .try_into()
            .unwrap(),
        };

        assert!(validate_inner_envelope_signer_weight(&inner, &auth).is_ok());
    }
}
