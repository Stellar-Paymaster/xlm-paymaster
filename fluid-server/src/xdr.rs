#![allow(dead_code)]

use base64::{engine::general_purpose::STANDARD, Engine};
use stellar_xdr::curr::{
    FeeBumpTransaction, FeeBumpTransactionInnerTx, Limits, Operation, OperationBody, ReadXdr,
    Transaction, TransactionEnvelope, TransactionV0,
};
use tracing::info;
use bytes::Bytes;

/// Shared buffer pool for zero-copy base64 decoding
thread_local! {
    static DECODE_BUFFER: std::cell::RefCell<Vec<u8>> = std::cell::RefCell::new(Vec::with_capacity(8192));
}

/// Zero-copy base64 decoder that reuses thread-local buffers
pub struct ZeroCopyDecoder;

impl ZeroCopyDecoder {
    /// Decode base64 bytes using a shared buffer to minimize allocations
    pub fn decode_with_buffer(input: &[u8]) -> Result<Vec<u8>, base64::DecodeError> {
        DECODE_BUFFER.with(|buffer| {
            let mut buf = buffer.borrow_mut();
            buf.clear();
            
            // Ensure capacity without reallocating if possible
            let estimated_len = base64::decoded_len_estimate(input.len());
            if buf.capacity() < estimated_len {
                buf.reserve(estimated_len - buf.capacity());
            }
            
            STANDARD.decode_vec(input, &mut buf)?;
            Ok(buf.clone()) // Only clone the actual decoded data
        })
    }
}

/// A parsed Stellar transaction covering all envelope variants.
#[derive(Debug)]
pub enum ParsedTransaction {
    /// Legacy V0 classic transaction (pre-muxed-account era).
    V0(Box<TransactionV0>),
    /// Current classic V1 transaction.
    V1(Box<Transaction>),
    /// Fee-bump envelope wrapping an inner V1 transaction.
    FeeBump(Box<FeeBumpTransaction>),
}

#[derive(Debug, Clone)]
pub struct TransactionSummary {
    pub sequence_number: i64,
    pub transaction_type: &'static str,
}

/// Errors produced by [`parse_xdr`].
#[derive(Debug)]
pub enum XdrError {
    Base64(base64::DecodeError),
    Xdr(stellar_xdr::curr::Error),
}

impl std::fmt::Display for XdrError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            XdrError::Base64(e) => write!(f, "base64 decode error: {e}"),
            XdrError::Xdr(e) => write!(f, "XDR parse error: {e}"),
        }
    }
}

impl std::error::Error for XdrError {}

impl From<base64::DecodeError> for XdrError {
    fn from(e: base64::DecodeError) -> Self {
        XdrError::Base64(e)
    }
}

impl From<stellar_xdr::curr::Error> for XdrError {
    fn from(e: stellar_xdr::curr::Error) -> Self {
        XdrError::Xdr(e)
    }
}

/// Parse a base64-encoded XDR string into a [`ParsedTransaction`].
///
/// Supports classic V0, classic V1, and fee-bump envelope types.
/// Leading/trailing whitespace is stripped before decoding.
/// Returns [`XdrError`] on invalid base64 or malformed XDR.
pub fn parse_xdr(base64_string: &str) -> Result<ParsedTransaction, XdrError> {
    // Zero-copy decode path: decode base64 into bytes, then parse XDR in-place.
    let bytes = STANDARD.decode(base64_string.trim())?;
    let envelope = TransactionEnvelope::from_xdr(bytes, Limits::none())?;

    let parsed = match envelope {
        TransactionEnvelope::TxV0(env) => ParsedTransaction::V0(Box::new(env.tx)),
        TransactionEnvelope::Tx(env) => ParsedTransaction::V1(Box::new(env.tx)),
        TransactionEnvelope::TxFeeBump(env) => ParsedTransaction::FeeBump(Box::new(env.tx)),
    };

    Ok(parsed)
}

/// Zero-copy XDR parsing using byte slice references.
/// This version uses a thread-local buffer pool to minimize allocations.
pub fn parse_xdr_zero_copy(base64_bytes: &[u8]) -> Result<ParsedTransaction, XdrError> {
    let decoded_bytes = ZeroCopyDecoder::decode_with_buffer(base64_bytes)?;
    let envelope = TransactionEnvelope::from_xdr(&decoded_bytes, Limits::none())?;

    let parsed = match envelope {
        TransactionEnvelope::TxV0(env) => ParsedTransaction::V0(Box::new(env.tx)),
        TransactionEnvelope::Tx(env) => ParsedTransaction::V1(Box::new(env.tx)),
        TransactionEnvelope::TxFeeBump(env) => ParsedTransaction::FeeBump(Box::new(env.tx)),
    };

    Ok(parsed)
}

/// Parse XDR from pre-decoded bytes, avoiding base64 decoding entirely.
pub fn parse_xdr_from_bytes(xdr_bytes: &[u8]) -> Result<ParsedTransaction, XdrError> {
    let envelope = TransactionEnvelope::from_xdr(xdr_bytes, Limits::none())?;

    let parsed = match envelope {
        TransactionEnvelope::TxV0(env) => ParsedTransaction::V0(Box::new(env.tx)),
        TransactionEnvelope::Tx(env) => ParsedTransaction::V1(Box::new(env.tx)),
        TransactionEnvelope::TxFeeBump(env) => ParsedTransaction::FeeBump(Box::new(env.tx)),
    };

    Ok(parsed)
}
/// Emit structured `tracing` logs showing the full operation breakdown.
///
/// Required per issue #41: logs must show each operation's type and index.
pub fn log_xdr_breakdown(parsed: &ParsedTransaction) {
    match parsed {
        ParsedTransaction::V0(tx) => {
            info!(
                tx_type = "ClassicV0",
                fee = tx.fee,
                seq_num = tx.seq_num.0,
                op_count = tx.operations.len(),
                "parsed transaction"
            );
            for (i, op) in tx.operations.iter().enumerate() {
                log_operation(i, op);
            }
        }
        ParsedTransaction::V1(tx) => {
            info!(
                tx_type = "ClassicV1",
                fee = tx.fee,
                seq_num = tx.seq_num.0,
                op_count = tx.operations.len(),
                "parsed transaction"
            );
            for (i, op) in tx.operations.iter().enumerate() {
                log_operation(i, op);
            }
        }
        ParsedTransaction::FeeBump(tx) => {
            info!(tx_type = "FeeBump", fee = tx.fee, "parsed transaction");
            match &tx.inner_tx {
                FeeBumpTransactionInnerTx::Tx(inner_env) => {
                    let inner = &inner_env.tx;
                    info!(
                        inner_type = "ClassicV1",
                        fee = inner.fee,
                        seq_num = inner.seq_num.0,
                        op_count = inner.operations.len(),
                        "inner transaction"
                    );
                    for (i, op) in inner.operations.iter().enumerate() {
                        log_operation(i, op);
                    }
                }
            }
        }
    }
}

pub fn summarize_transaction(parsed: &ParsedTransaction) -> TransactionSummary {
    match parsed {
        ParsedTransaction::V0(tx) => TransactionSummary {
            sequence_number: tx.seq_num.0,
            transaction_type: "classic_v0",
        },
        ParsedTransaction::V1(tx) => TransactionSummary {
            sequence_number: tx.seq_num.0,
            transaction_type: "classic_v1",
        },
        ParsedTransaction::FeeBump(tx) => match &tx.inner_tx {
            FeeBumpTransactionInnerTx::Tx(inner_env) => TransactionSummary {
                sequence_number: inner_env.tx.seq_num.0,
                transaction_type: "fee_bump",
            },
        },
    }
}

fn operation_name(body: &OperationBody) -> &'static str {
    match body {
        OperationBody::CreateAccount(_) => "CreateAccount",
        OperationBody::Payment(_) => "Payment",
        OperationBody::PathPaymentStrictReceive(_) => "PathPaymentStrictReceive",
        OperationBody::ManageSellOffer(_) => "ManageSellOffer",
        OperationBody::CreatePassiveSellOffer(_) => "CreatePassiveSellOffer",
        OperationBody::SetOptions(_) => "SetOptions",
        OperationBody::ChangeTrust(_) => "ChangeTrust",
        OperationBody::AllowTrust(_) => "AllowTrust",
        OperationBody::AccountMerge(_) => "AccountMerge",
        OperationBody::Inflation => "Inflation",
        OperationBody::ManageData(_) => "ManageData",
        OperationBody::BumpSequence(_) => "BumpSequence",
        OperationBody::ManageBuyOffer(_) => "ManageBuyOffer",
        OperationBody::PathPaymentStrictSend(_) => "PathPaymentStrictSend",
        OperationBody::CreateClaimableBalance(_) => "CreateClaimableBalance",
        OperationBody::ClaimClaimableBalance(_) => "ClaimClaimableBalance",
        OperationBody::BeginSponsoringFutureReserves(_) => "BeginSponsoringFutureReserves",
        OperationBody::EndSponsoringFutureReserves => "EndSponsoringFutureReserves",
        OperationBody::RevokeSponsorship(_) => "RevokeSponsorship",
        OperationBody::Clawback(_) => "Clawback",
        OperationBody::ClawbackClaimableBalance(_) => "ClawbackClaimableBalance",
        OperationBody::SetTrustLineFlags(_) => "SetTrustLineFlags",
        OperationBody::LiquidityPoolDeposit(_) => "LiquidityPoolDeposit",
        OperationBody::LiquidityPoolWithdraw(_) => "LiquidityPoolWithdraw",
        OperationBody::InvokeHostFunction(_) => "InvokeHostFunction",
        OperationBody::ExtendFootprintTtl(_) => "ExtendFootprintTtl",
        OperationBody::RestoreFootprint(_) => "RestoreFootprint",
    }
}

fn log_operation(index: usize, op: &Operation) {
    info!(index, op_type = operation_name(&op.body), "operation");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use stellar_xdr::curr::{
        Asset, FeeBumpTransaction, FeeBumpTransactionEnvelope, FeeBumpTransactionExt,
        FeeBumpTransactionInnerTx, Limits, Memo, MuxedAccount, Operation, OperationBody, PaymentOp,
        Preconditions, SequenceNumber, Transaction, TransactionEnvelope, TransactionExt,
        TransactionV1Envelope, Uint256, VecM, WriteXdr,
    };

    /// Build a minimal Classic V1 transaction with a single Payment op.
    fn classic_v1_xdr() -> String {
        let source = MuxedAccount::Ed25519(Uint256([0u8; 32]));
        let dest = MuxedAccount::Ed25519(Uint256([1u8; 32]));

        let op = Operation {
            source_account: None,
            body: OperationBody::Payment(PaymentOp {
                destination: dest,
                asset: Asset::Native,
                amount: 10_000_000, // 1 XLM
            }),
        };

        let tx = Transaction {
            source_account: source,
            fee: 100,
            seq_num: SequenceNumber(42),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![op].try_into().unwrap(),
            ext: TransactionExt::V0,
        };

        let envelope = TransactionEnvelope::Tx(TransactionV1Envelope {
            tx,
            signatures: VecM::default(),
        });

        let bytes = envelope.to_xdr(Limits::none()).unwrap();
        STANDARD.encode(bytes)
    }

    /// Build a Classic V1 transaction with multiple operation types.
    fn multi_op_xdr() -> String {
        let source = MuxedAccount::Ed25519(Uint256([0u8; 32]));
        let dest = MuxedAccount::Ed25519(Uint256([1u8; 32]));

        let ops: Vec<Operation> = vec![
            Operation {
                source_account: None,
                body: OperationBody::Payment(PaymentOp {
                    destination: dest.clone(),
                    asset: Asset::Native,
                    amount: 5_000_000,
                }),
            },
            Operation {
                source_account: None,
                body: OperationBody::Payment(PaymentOp {
                    destination: dest,
                    asset: Asset::Native,
                    amount: 5_000_000,
                }),
            },
        ];

        let tx = Transaction {
            source_account: source,
            fee: 200,
            seq_num: SequenceNumber(99),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: ops.try_into().unwrap(),
            ext: TransactionExt::V0,
        };

        let envelope = TransactionEnvelope::Tx(TransactionV1Envelope {
            tx,
            signatures: VecM::default(),
        });

        let bytes = envelope.to_xdr(Limits::none()).unwrap();
        STANDARD.encode(bytes)
    }

    /// Build a Fee-Bump transaction wrapping an inner Classic V1 tx.
    fn fee_bump_xdr() -> String {
        let inner_source = MuxedAccount::Ed25519(Uint256([0u8; 32]));
        let dest = MuxedAccount::Ed25519(Uint256([1u8; 32]));

        let op = Operation {
            source_account: None,
            body: OperationBody::Payment(PaymentOp {
                destination: dest,
                asset: Asset::Native,
                amount: 10_000_000,
            }),
        };

        let inner_tx = Transaction {
            source_account: inner_source,
            fee: 100,
            seq_num: SequenceNumber(7),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![op].try_into().unwrap(),
            ext: TransactionExt::V0,
        };

        let fee_source = MuxedAccount::Ed25519(Uint256([2u8; 32]));

        let fee_bump = FeeBumpTransaction {
            fee_source,
            fee: 500,
            inner_tx: FeeBumpTransactionInnerTx::Tx(TransactionV1Envelope {
                tx: inner_tx,
                signatures: VecM::default(),
            }),
            ext: FeeBumpTransactionExt::V0,
        };

        let envelope = TransactionEnvelope::TxFeeBump(FeeBumpTransactionEnvelope {
            tx: fee_bump,
            signatures: VecM::default(),
        });

        let bytes = envelope.to_xdr(Limits::none()).unwrap();
        STANDARD.encode(bytes)
    }

    // ── Initialise tracing once for tests that need log output ───────────────

    fn init_tracing() {
        let _ = tracing_subscriber::fmt()
            .with_test_writer()
            .with_max_level(tracing::Level::INFO)
            .try_init();
    }

    // ── Happy-path tests ─────────────────────────────────────────────────────

    #[test]
    fn test_parse_classic_v1() {
        init_tracing();
        let xdr = classic_v1_xdr();
        let parsed = parse_xdr(&xdr).expect("valid XDR should parse");

        assert!(
            matches!(parsed, ParsedTransaction::V1(_)),
            "expected V1, got {parsed:?}"
        );

        if let ParsedTransaction::V1(ref tx) = parsed {
            assert_eq!(tx.fee, 100);
            assert_eq!(tx.seq_num.0, 42);
            assert_eq!(tx.operations.len(), 1);
            assert!(matches!(tx.operations[0].body, OperationBody::Payment(_)));

            println!("\n=== Classic V1 Transaction Breakdown ===");
            println!("  tx_type  : ClassicV1");
            println!("  fee      : {} stroops", tx.fee);
            println!("  seq_num  : {}", tx.seq_num.0);
            println!("  op_count : {}", tx.operations.len());
            for (i, op) in tx.operations.iter().enumerate() {
                println!("  op[{i}]    : {}", operation_name(&op.body));
            }
        }

        log_xdr_breakdown(&parsed);
    }

    #[test]
    fn test_parse_multi_op_classic() {
        init_tracing();
        let xdr = multi_op_xdr();
        let parsed = parse_xdr(&xdr).expect("multi-op XDR should parse");

        if let ParsedTransaction::V1(ref tx) = parsed {
            assert_eq!(tx.operations.len(), 2);
            assert_eq!(tx.fee, 200);

            println!("\n=== Multi-Op Classic V1 Breakdown ===");
            println!("  fee      : {} stroops", tx.fee);
            println!("  seq_num  : {}", tx.seq_num.0);
            println!("  op_count : {}", tx.operations.len());
            for (i, op) in tx.operations.iter().enumerate() {
                println!("  op[{i}]    : {}", operation_name(&op.body));
            }
        } else {
            panic!("expected V1, got {parsed:?}");
        }

        log_xdr_breakdown(&parsed);
    }

    #[test]
    fn test_parse_fee_bump() {
        init_tracing();
        let xdr = fee_bump_xdr();
        let parsed = parse_xdr(&xdr).expect("fee-bump XDR should parse");

        assert!(
            matches!(parsed, ParsedTransaction::FeeBump(_)),
            "expected FeeBump, got {parsed:?}"
        );

        if let ParsedTransaction::FeeBump(ref fb) = parsed {
            assert_eq!(fb.fee, 500);

            println!("\n=== Fee-Bump Transaction Breakdown ===");
            println!("  tx_type  : FeeBump");
            println!("  fee      : {} stroops", fb.fee);

            let FeeBumpTransactionInnerTx::Tx(ref inner_env) = fb.inner_tx;
            let inner = &inner_env.tx;
            println!("  inner.fee      : {} stroops", inner.fee);
            println!("  inner.seq_num  : {}", inner.seq_num.0);
            println!("  inner.op_count : {}", inner.operations.len());
            for (i, op) in inner.operations.iter().enumerate() {
                println!("  inner.op[{i}]    : {}", operation_name(&op.body));
            }
        }

        log_xdr_breakdown(&parsed);
    }

    // ── Error-handling tests ─────────────────────────────────────────────────

    #[test]
    fn test_invalid_base64_returns_error() {
        let result = parse_xdr("not!!!valid===base64");
        assert!(
            matches!(result, Err(XdrError::Base64(_))),
            "expected Base64 error, got {result:?}"
        );
    }

    #[test]
    fn test_malformed_xdr_returns_error() {
        // Valid base64 but not valid XDR.
        let b64 = STANDARD.encode(b"this is definitely not XDR data");
        let result = parse_xdr(&b64);
        assert!(
            matches!(result, Err(XdrError::Xdr(_))),
            "expected Xdr error, got {result:?}"
        );
    }

    #[test]
    fn test_whitespace_is_trimmed() {
        let xdr = classic_v1_xdr();
        let padded = format!("   {xdr}   \n");
        let result = parse_xdr(&padded);
        assert!(
            result.is_ok(),
            "whitespace-padded XDR should parse: {result:?}"
        );
    }

    #[test]
    fn test_empty_string_returns_error() {
        let result = parse_xdr("");
        assert!(result.is_err(), "empty string should return an error");
    #[test]
    fn test_zero_copy_parsing() {
        let xdr = classic_v1_xdr();
        let result = parse_xdr_zero_copy(xdr.as_bytes());
        assert!(result.is_ok(), "zero-copy parsing should work");
        
        if let Ok(ParsedTransaction::V1(tx)) = result {
            assert_eq!(tx.fee, 100);
            assert_eq!(tx.seq_num.0, 42);
        } else {
            panic!("Expected V1 transaction");
        }
    }

    #[test]
    fn test_parse_from_bytes() {
        let xdr = classic_v1_xdr();
        let decoded_bytes = STANDARD.decode(&xdr).unwrap();
        let result = parse_xdr_from_bytes(&decoded_bytes);
        assert!(result.is_ok(), "parsing from bytes should work");
        
        if let Ok(ParsedTransaction::V1(tx)) = result {
            assert_eq!(tx.fee, 100);
            assert_eq!(tx.seq_num.0, 42);
        } else {
            panic!("Expected V1 transaction");
        }
    }

    #[test]
    fn test_zero_copy_decoder() {
        use super::ZeroCopyDecoder;
        
        let test_data = "SGVsbG8gV29ybGQ="; // "Hello World" in base64
        let result = ZeroCopyDecoder::decode_with_buffer(test_data.as_bytes());
        assert!(result.is_ok());
        
        let decoded = result.unwrap();
        assert_eq!(decoded, b"Hello World");
    }
    }
}
