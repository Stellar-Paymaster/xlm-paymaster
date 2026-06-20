use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use reqwest::Client;
use sha2::{Digest, Sha256};
use stellar_strkey::{ed25519, Strkey};
use stellar_xdr::curr::{
    Asset, DecoratedSignature, Hash, Limits, Memo, MuxedAccount, MuxedAccountMed25519, Operation,
    OperationBody, PaymentOp, Preconditions, SequenceNumber, Signature, SignatureHint, Transaction,
    TransactionEnvelope, TransactionExt, TransactionSignaturePayload,
    TransactionSignaturePayloadTaggedTransaction, TransactionV1Envelope, Uint256, WriteXdr,
};

fn build_secret(seed_byte: u8) -> String {
    Strkey::PrivateKeyEd25519(ed25519::PrivateKey([seed_byte; 32]))
        .to_string()
        .to_string()
}

fn build_signed_muxed_transaction_xdr(seed_byte: u8) -> String {
    let secret = [seed_byte; 32];
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
                // Here is the multiplexed address usage
                destination: MuxedAccount::MuxedEd25519(MuxedAccountMed25519 {
                    id: 123456789,
                    ed25519: Uint256(destination),
                }),
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
async fn fee_bump_muxed_address_integration() {
    let mut mock = paymaster_server::mock_horizon::MockHorizonServer::new();
    let horizon_base = mock.start().await;
    let server = TestServer::spawn(&horizon_base).await;
    let client = Client::new();

    let xdr = build_signed_muxed_transaction_xdr(1);

    let accepted = client
        .post(format!("{}/fee-bump", server.base_url))
        .header("x-api-key", "paymaster-pro-demo-key")
        .json(&serde_json::json!({ "xdr": xdr, "submit": false }))
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
            .env("PAYMASTER_FEE_PAYER_SECRET", secret)
            .env("STELLAR_HORIZON_URL", horizon_url)
            .env("PAYMASTER_DISABLE_RATE_LIMITS", "true")
            .env("STELLAR_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("paymaster-server should start");

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
        panic!("paymaster-server did not become healthy");
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
