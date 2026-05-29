use axum::http::StatusCode;
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use bytes::Bytes;
use sha2::{Digest, Sha256};
use stellar_strkey::Strkey;
use stellar_xdr::curr::{
    DecoratedSignature, FeeBumpTransaction, FeeBumpTransactionEnvelope, FeeBumpTransactionExt,
    FeeBumpTransactionInnerTx, Hash, Limits, MuxedAccount, ReadXdr, Signature, SignatureHint,
    TransactionEnvelope, TransactionSignaturePayload, TransactionSignaturePayloadTaggedTransaction,
    Uint256, WriteXdr,
};
use tracing::info;

use crate::error::AppError;
use crate::xdr;

pub struct CreatedFeeBumpTransaction {
    pub fee_amount: i64,
    pub fee_bump_xdr: String,
    pub parsed_inner: xdr::ParsedTransaction,
}

pub fn create_fee_bump_transaction(
    input_xdr: &str,
    network_passphrase: &str,
    base_fee: i64,
    fee_multiplier: f64,
    signer_secret: &str,
    signer_public_key_bytes: &[u8; 32],
) -> Result<CreatedFeeBumpTransaction, AppError> {
    let trimmed = input_xdr.trim();
    let parsed_inner = xdr::parse_xdr(trimmed).map_err(|error| {
        AppError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_XDR",
            format!("Invalid XDR: {error}"),
        )
    })?;

    let envelope = TransactionEnvelope::from_xdr(
        STANDARD.decode(trimmed).map_err(|error| {
            AppError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_XDR",
                format!("Invalid XDR: {error}"),
            )
        })?,
        Limits::none(),
    )
    .map_err(|error| {
        AppError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_XDR",
            format!("Invalid XDR: {error}"),
        )
    })?;

    let inner_v1 = match envelope {
        TransactionEnvelope::Tx(env) => {
            if env.signatures.is_empty() {
                return Err(AppError::new(
                    StatusCode::BAD_REQUEST,
                    "UNSIGNED_TRANSACTION",
                    "Inner transaction must be signed before fee-bumping",
                ));
            }

            env
        }
        TransactionEnvelope::TxFeeBump(_) => {
            return Err(AppError::new(
                StatusCode::BAD_REQUEST,
                "ALREADY_FEE_BUMPED",
                "Cannot fee-bump an already fee-bumped transaction",
            ))
        }
        TransactionEnvelope::TxV0(_) => {
            return Err(AppError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_XDR",
                "Invalid XDR: TransactionV0 envelopes are not yet supported by the Rust server",
            ))
        }
    };

    let operation_count = inner_v1.tx.operations.len() as i64;
    let fee_amount = (((operation_count + 1) * base_fee) as f64 * fee_multiplier).ceil() as i64;
    info!(
        "Fee calculation: {:?}",
        serde_json::json!({
            "operationCount": operation_count,
            "baseFee": base_fee,
            "multiplier": fee_multiplier,
            "finalFee": fee_amount,
        })
    );

    let outer_fee = fee_amount * (operation_count + 1);
    let fee_bump = FeeBumpTransaction {
        fee_source: MuxedAccount::Ed25519(Uint256(*signer_public_key_bytes)),
        fee: outer_fee,
        inner_tx: FeeBumpTransactionInnerTx::Tx(inner_v1),
        ext: FeeBumpTransactionExt::V0,
    };

    let signature = sign_fee_bump(
        &fee_bump,
        signer_secret,
        signer_public_key_bytes,
        network_passphrase,
    )?;
    let envelope = TransactionEnvelope::TxFeeBump(FeeBumpTransactionEnvelope {
        tx: fee_bump,
        signatures: vec![signature].try_into().map_err(|_| {
            AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Failed to attach fee-bump signature",
            )
        })?,
    });

    let fee_bump_xdr = STANDARD.encode(envelope.to_xdr(Limits::none()).map_err(|error| {
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            format!("Failed to serialize fee-bump transaction: {error}"),
        )
    })?);

    Ok(CreatedFeeBumpTransaction {
        fee_amount,
        fee_bump_xdr,
        parsed_inner,
    })
}

fn sign_fee_bump(
    fee_bump: &FeeBumpTransaction,
    signer_secret: &str,
    signer_public_key_bytes: &[u8; 32],
    network_passphrase: &str,
) -> Result<DecoratedSignature, AppError> {
    let secret = match Strkey::from_string(signer_secret).map_err(|error| {
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            format!("Failed to parse fee payer secret: {error}"),
        )
    })? {
        Strkey::PrivateKeyEd25519(private_key) => private_key,
        _ => {
            return Err(AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Expected a Stellar ed25519 private key",
            ))
        }
    };

    let signing_key = SigningKey::from_bytes(&secret.0);
    let network_hash: [u8; 32] = Sha256::digest(network_passphrase.as_bytes()).into();
    let payload = TransactionSignaturePayload {
        network_id: Hash(network_hash),
        tagged_transaction: TransactionSignaturePayloadTaggedTransaction::TxFeeBump(
            fee_bump.clone(),
        ),
    };
    let signature_payload = payload.to_xdr(Limits::none()).map_err(|error| {
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            format!("Failed to serialize signature payload: {error}"),
        )
    })?;
    let payload_hash: [u8; 32] = Sha256::digest(signature_payload).into();
    let signature = signing_key.sign(&payload_hash).to_bytes();

    Ok(DecoratedSignature {
        hint: SignatureHint([
            signer_public_key_bytes[28],
            signer_public_key_bytes[29],
            signer_public_key_bytes[30],
            signer_public_key_bytes[31],
        ]),
        signature: Signature(signature.to_vec().try_into().map_err(|_| {
            AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Failed to encode signature bytes",
            )
        })?),
    })
}
