use std::{
    process::{Command, Stdio},
    time::Duration,
};

use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use reqwest::Client;
use sha2::{Digest, Sha256};
use stellar_strkey::{ed25519, Strkey};
use stellar_xdr::curr::{
    Asset, DecoratedSignature, Hash, Limits, Memo, MuxedAccount, Operation, OperationBody,
    PaymentOp, Preconditions, SequenceNumber, Signature, SignatureHint, Transaction,
    TransactionEnvelope, TransactionExt, TransactionSignaturePayload,
    TransactionSignaturePayloadTaggedTransaction, TransactionV1Envelope, Uint256, WriteXdr,
};

fn build_secret(seed_byte: u8) -> String {
    Strkey::PrivateKeyEd25519(ed25519::PrivateKey([seed_byte; 32]))
        .to_string()
        .to_string()
}

fn build_signed_transaction_xdr() -> String {
    let secret = [9_u8; 32];
    let signing_key = SigningKey::from_bytes(&secret);
    let source = signing_key.verifying_key().to_bytes();
    let destination = [7_u8; 32];

    let tx = Transaction {
        source_account: MuxedAccount::Ed25519(Uint256(source)),
        fee: 100,
        seq_num: SequenceNumber(42),
        cond: Preconditions::None,
        memo: Memo::None,
        operations: vec![Operation {
            source_account: None,
            body: OperationBody::Payment(PaymentOp {
                destination: MuxedAccount::Ed25519(Uint256(destination)),
                asset: Asset::Native,
                amount: 10_000_000,
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
    let payload_xdr = payload.to_xdr(Limits::none()).unwrap();
    let tx_hash: [u8; 32] = Sha256::digest(payload_xdr).into();
    let signature = signing_key.sign(&tx_hash).to_bytes();

    let envelope = TransactionEnvelope::Tx(TransactionV1Envelope {
        tx,
        signatures: vec![DecoratedSignature {
            hint: SignatureHint([source[28], source[29], source[30], source[31]]),
            signature: Signature(signature.to_vec().try_into().unwrap()),
        }]
        .try_into()
        .unwrap(),
    });

    base64::engine::general_purpose::STANDARD.encode(envelope.to_xdr(Limits::none()).unwrap())
}

#[tokio::test]
async fn test_rate_limits_enforced_by_default() {
    let port = "3233";
    let server_bin = env!("CARGO_BIN_EXE_paymaster-server");
    let fee_payer_secret = build_secret(5);
    let signed_xdr = build_signed_transaction_xdr();

    let mut child = Command::new(server_bin)
        .env("PORT", port)
        .env("FLUID_FEE_PAYER_SECRET", &fee_payer_secret)
        .env(
            "STELLAR_NETWORK_PASSPHRASE",
            "Test SDF Network ; September 2015",
        )
        .env("FLUID_DISABLE_RATE_LIMITS", "false")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("rust server should spawn");

    let client = Client::new();

    // Wait for server to start
    for _ in 0..40 {
        if client
            .get(format!("http://127.0.0.1:{port}/health"))
            .send()
            .await
            .map(|response| response.status().is_success())
            .unwrap_or(false)
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }

    // fluid-pro-demo-key rate limit is max_requests = 5.
    // Send 6 requests. The first few should be success (or quota exceeded if quota checked, but let's check status codes).
    // Actually, fluid-pro-demo-key has daily_quota_stroops = 2000.
    // One transaction consumes base_fee * multiplier = 100 * 2.0 = 200 stroops.
    // Send multiple requests and check if we hit either quota limits or rate limits.
    let mut statuses = Vec::new();
    for _ in 0..8 {
        if let Ok(res) = client
            .post(format!("http://127.0.0.1:{port}/fee-bump"))
            .header("content-type", "application/json")
            .header("x-api-key", "fluid-pro-demo-key")
            .body(
                serde_json::json!({
                    "xdr": signed_xdr,
                    "submit": false
                })
                .to_string(),
            )
            .send()
            .await
        {
            statuses.push(res.status().as_u16());
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    child.kill().expect("rust server should stop");

    // We should have hit rate limit (429) or quota exceeded (403) for the later requests
    println!("Default limit behavior statuses: {:?}", statuses);
    assert!(statuses.contains(&429) || statuses.contains(&403));
}

#[tokio::test]
async fn test_rate_limits_bypassed_when_configured() {
    let port = "3234";
    let server_bin = env!("CARGO_BIN_EXE_paymaster-server");
    let fee_payer_secret = build_secret(6);
    let signed_xdr = build_signed_transaction_xdr();

    let mut child = Command::new(server_bin)
        .env("PORT", port)
        .env("FLUID_FEE_PAYER_SECRET", &fee_payer_secret)
        .env(
            "STELLAR_NETWORK_PASSPHRASE",
            "Test SDF Network ; September 2015",
        )
        .env("FLUID_DISABLE_RATE_LIMITS", "true")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("rust server should spawn");

    let client = Client::new();

    // Wait for server to start
    for _ in 0..40 {
        if client
            .get(format!("http://127.0.0.1:{port}/health"))
            .send()
            .await
            .map(|response| response.status().is_success())
            .unwrap_or(false)
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }

    // Send 10 requests. With rate limits disabled, all should succeed (HTTP 200).
    let mut statuses = Vec::new();
    for _ in 0..10 {
        if let Ok(res) = client
            .post(format!("http://127.0.0.1:{port}/fee-bump"))
            .header("content-type", "application/json")
            .header("x-api-key", "fluid-pro-demo-key")
            .body(
                serde_json::json!({
                    "xdr": signed_xdr,
                    "submit": false
                })
                .to_string(),
            )
            .send()
            .await
        {
            statuses.push(res.status().as_u16());
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    child.kill().expect("rust server should stop");

    println!("Bypassed limit behavior statuses: {:?}", statuses);
    // All requests must succeed with HTTP 200
    for status in statuses {
        assert_eq!(
            status, 200,
            "expected HTTP 200 since rate limiting and quota checking are disabled"
        );
    }
}
