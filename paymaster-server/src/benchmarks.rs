//! Benchmark tests for zero-copy XDR optimization

use base64::{engine::general_purpose::STANDARD, Engine};
use stellar_xdr::curr::{
    Asset, Limits, Memo, MuxedAccount, Operation, OperationBody, PaymentOp, Preconditions,
    SequenceNumber, Transaction, TransactionEnvelope, TransactionExt, TransactionV1Envelope,
    Uint256, VecM, WriteXdr,
};

use crate::profiling::{benchmark_xdr_parsing, MemoryStats};
use crate::xdr::{parse_xdr, parse_xdr_zero_copy, parse_xdr_from_bytes};

/// Generate a test XDR string for benchmarking
fn generate_test_xdr() -> String {
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

#[cfg(test)]
mod benchmarks {
    use super::*;

    #[test]
    fn benchmark_original_vs_zero_copy() {
        let test_xdr = generate_test_xdr();
        let iterations = 1000;

        println!("Benchmarking XDR parsing with {} iterations", iterations);
        println!("Test XDR length: {} bytes", test_xdr.len());

        // Benchmark original implementation
        benchmark_xdr_parsing("Original parse_xdr", iterations, || {
            let _parsed = parse_xdr(&test_xdr)?;
            Ok(())
        });

        // Benchmark zero-copy implementation
        benchmark_xdr_parsing("Zero-copy parse_xdr_zero_copy", iterations, || {
            let _parsed = parse_xdr_zero_copy(test_xdr.as_bytes())?;
            Ok(())
        });

        // Benchmark pre-decoded bytes (ultimate zero-copy)
        let decoded_bytes = STANDARD.decode(&test_xdr).unwrap();
        benchmark_xdr_parsing("Pre-decoded parse_xdr_from_bytes", iterations, || {
            let _parsed = parse_xdr_from_bytes(&decoded_bytes)?;
            Ok(())
        });
    }

    #[test]
    fn benchmark_base64_decoding() {
        let test_xdr = generate_test_xdr();
        let iterations = 10000;

        println!("\nBenchmarking base64 decoding with {} iterations", iterations);

        // Benchmark standard decode (allocates Vec<u8>)
        benchmark_xdr_parsing("Standard base64 decode", iterations, || {
            let _decoded = STANDARD.decode(&test_xdr)?;
            Ok(())
        });

        // Benchmark decode_vec with pre-allocated buffer
        let mut buffer = Vec::with_capacity(1024);
        benchmark_xdr_parsing("Reused buffer decode_vec", iterations, || {
            buffer.clear();
            let _decoded = STANDARD.decode_vec(test_xdr.as_bytes(), &mut buffer)?;
            Ok(())
        });
    }

    #[test]
    fn memory_usage_comparison() {
        let test_xdr = generate_test_xdr();
        
        println!("\n=== Memory Usage Comparison ===");
        
        // Test original implementation
        MemoryStats::reset();
        let start = MemoryStats::current();
        
        for _ in 0..100 {
            let _parsed = parse_xdr(&test_xdr).unwrap();
        }
        
        let end = MemoryStats::current();
        let original_stats = end.diff(&start);
        
        println!("Original implementation:");
        println!("  Allocations: {}", original_stats.allocations);
        println!("  Bytes allocated: {}", original_stats.bytes_allocated);
        
        // Test zero-copy implementation
        MemoryStats::reset();
        let start = MemoryStats::current();
        
        for _ in 0..100 {
            let _parsed = parse_xdr_zero_copy(test_xdr.as_bytes()).unwrap();
        }
        
        let end = MemoryStats::current();
        let zero_copy_stats = end.diff(&start);
        
        println!("Zero-copy implementation:");
        println!("  Allocations: {}", zero_copy_stats.allocations);
        println!("  Bytes allocated: {}", zero_copy_stats.bytes_allocated);
        
        // Calculate improvement
        let alloc_reduction = original_stats.allocations.saturating_sub(zero_copy_stats.allocations);
        let bytes_reduction = original_stats.bytes_allocated.saturating_sub(zero_copy_stats.bytes_allocated);
        
        println!("Improvement:");
        println!("  Allocation reduction: {} ({:.1}%)", 
                 alloc_reduction, 
                 (alloc_reduction as f64 / original_stats.allocations as f64) * 100.0);
        println!("  Bytes reduction: {} ({:.1}%)", 
                 bytes_reduction,
                 (bytes_reduction as f64 / original_stats.bytes_allocated as f64) * 100.0);
    }
}