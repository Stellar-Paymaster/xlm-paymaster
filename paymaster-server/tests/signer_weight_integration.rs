//! Integration coverage for inner-transaction signer-weight preflight (#686).

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

fn build_signed_transaction_xdr(seed_byte: u8, med_threshold: u32) -> (String, String) {
    let secret = [seed_byte; 32];
    let signing_key = SigningKey::from_bytes(&secret);
    let source = signing_key.verifying_key().to_bytes();
    let account_id = Strkey::PublicKeyEd25519(stellar_strkey::ed25519::PublicKey(source))
        .to_string()
        .to_string();
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

    let xdr = base64::engine::general_purpose::STANDARD.encode(envelope.to_xdr(Limits::none()).unwrap());
    let _ = med_threshold;
    (xdr, account_id)
}

#[tokio::test]
async fn fee_bump_preflight_signer_weight_integration() {
    let mut mock = fluid_server::mock_horizon::MockHorizonServer::new();
    let horizon_base = mock.start().await;
    let server = TestServer::spawn(&horizon_base).await;
    let client = Client::new();

    // Insufficient weight: med_threshold 2, signer weight 1.
    let (insufficient_xdr, insufficient_account) = build_signed_transaction_xdr(9, 2);
    mock.set_account_auth(
        &insufficient_account,
        serde_json::json!({
            "thresholds": {
                "low_threshold": 0,
                "med_threshold": 2,
                "high_threshold": 5
            },
            "signers": [{
                "weight": 1,
                "key": insufficient_account,
                "type": "ed25519_public_key"
            }]
        }),
    );

    let rejected = client
        .post(format!("{}/fee-bump", server.base_url))
        .header("x-api-key", "fluid-pro-demo-key")
        .json(&serde_json::json!({ "xdr": insufficient_xdr, "submit": false }))
        .send()
        .await
        .expect("fee-bump request should complete");

    assert_eq!(rejected.status(), 400);
    let rejected_body: serde_json::Value = rejected.json().await.unwrap();
    assert_eq!(rejected_body["code"], "INSUFFICIENT_SIGNATURE_WEIGHT");

    // Sufficient weight: med_threshold 1, signer weight 1.
    let (sufficient_xdr, sufficient_account) = build_signed_transaction_xdr(10, 1);
    mock.set_account_auth(
        &sufficient_account,
        serde_json::json!({
            "thresholds": {
                "low_threshold": 0,
                "med_threshold": 1,
                "high_threshold": 5
            },
            "signers": [{
                "weight": 1,
                "key": sufficient_account,
                "type": "ed25519_public_key"
            }]
        }),
    );

    let accepted = client
        .post(format!("{}/fee-bump", server.base_url))
        .header("x-api-key", "fluid-pro-demo-key")
        .json(&serde_json::json!({ "xdr": sufficient_xdr, "submit": false }))
        .send()
        .await
        .expect("fee-bump request should complete");

    assert_eq!(accepted.status(), 200);
    let accepted_body: serde_json::Value = accepted.json().await.unwrap();
    assert_eq!(accepted_body["status"], "ready");

    mock.stop().await;
}

struct TestServer {
    base_url: String,
    child: std::process::Child,
}

impl TestServer {
    async fn spawn(horizon_url: &str) -> Self {
        use std::process::{Command, Stdio};

        let secret = build_secret(1);
        let http_port = {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            listener.local_addr().unwrap().port()
        };
        let grpc_port = {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            listener.local_addr().unwrap().port()
        };

        let mut child = Command::new(env!("CARGO_BIN_EXE_paymaster-server"))
            .env("PORT", http_port.to_string())
            .env("GRPC_PORT", grpc_port.to_string())
            .env("FLUID_FEE_PAYER_SECRET", secret)
            .env("STELLAR_HORIZON_URL", horizon_url)
            .env("FLUID_DISABLE_RATE_LIMITS", "true")
            .env("STELLAR_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("fluid-server should start");

        let base_url = format!("http://127.0.0.1:{http_port}");
        for _ in 0..60 {
            if Client::new()
                .get(format!("{base_url}/health"))
                .send()
                .await
                .map(|r| r.status().is_success())
                .unwrap_or(false)
            {
                return Self { base_url, child };
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }

        let _ = child.kill();
        panic!("fluid-server did not become healthy");
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
