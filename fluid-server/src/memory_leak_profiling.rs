//! Memory leak profiling under sustained load.
//!
//! Issue #737 – Profile the Rust server for memory leaks by running a
//! high-iteration stress loop and asserting that net allocations remain
//! bounded (i.e. no unbounded growth that would indicate a leak).
//!
//! Run with:
//!   cargo test memory_leak -- --nocapture

#[cfg(test)]
mod memory_leak_profiling {
    use crate::profiling::MemoryStats;
    use crate::xdr::{parse_xdr, parse_xdr_zero_copy};
    use base64::{engine::general_purpose::STANDARD, Engine};
    use stellar_xdr::curr::{
        Asset, Limits, Memo, MuxedAccount, Operation, OperationBody, PaymentOp, Preconditions,
        SequenceNumber, Transaction, TransactionEnvelope, TransactionExt, TransactionV1Envelope,
        Uint256, VecM, WriteXdr,
    };

    // ── fixture ──────────────────────────────────────────────────────────────

    fn make_xdr() -> String {
        let source = MuxedAccount::Ed25519(Uint256([0u8; 32]));
        let dest = MuxedAccount::Ed25519(Uint256([1u8; 32]));

        let op = Operation {
            source_account: None,
            body: OperationBody::Payment(PaymentOp {
                destination: dest,
                asset: Asset::Native,
                amount: 10_000_000,
            }),
        };

        let tx = Transaction {
            source_account: source,
            fee: 100,
            seq_num: SequenceNumber(1),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![op].try_into().unwrap(),
            ext: TransactionExt::V0,
        };

        let envelope = TransactionEnvelope::Tx(TransactionV1Envelope {
            tx,
            signatures: VecM::default(),
        });

        STANDARD.encode(envelope.to_xdr(Limits::none()).unwrap())
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /// Run `iterations` of `op`, return (net_allocations_after_warmup, bytes_after_warmup).
    ///
    /// A warmup phase of `warmup` iterations is executed first so that
    /// one-time initialisation allocations (lazy statics, thread-locals, etc.)
    /// are excluded from the measurement window.
    fn measure<F: FnMut()>(
        warmup: usize,
        iterations: usize,
        mut op: F,
    ) -> (usize, usize) {
        // Warmup – not measured
        for _ in 0..warmup {
            op();
        }

        MemoryStats::reset();
        let before = MemoryStats::current();

        for _ in 0..iterations {
            op();
        }

        let after = MemoryStats::current();
        let diff = after.diff(&before);
        (diff.net_allocations, diff.bytes_allocated)
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    /// Net allocations must not grow linearly with iteration count.
    ///
    /// We run two windows of equal size and assert the second window does not
    /// produce significantly more net allocations than the first.  A true leak
    /// would cause the second window to be noticeably larger.
    #[test]
    fn parse_xdr_net_allocations_do_not_grow_between_windows() {
        let xdr = make_xdr();
        let window = 500;
        let warmup = 50;

        let (net1, bytes1) = measure(warmup, window, || {
            let _ = parse_xdr(&xdr);
        });

        let (net2, bytes2) = measure(0, window, || {
            let _ = parse_xdr(&xdr);
        });

        println!("\n=== parse_xdr memory leak check ===");
        println!("  window size : {window} iterations");
        println!("  window 1 – net allocs: {net1}, bytes: {bytes1}");
        println!("  window 2 – net allocs: {net2}, bytes: {bytes2}");

        // Allow a 20 % tolerance for measurement noise.
        let tolerance = (net1 as f64 * 1.20) as usize + 10;
        assert!(
            net2 <= tolerance,
            "net allocations grew from {net1} to {net2} between windows (tolerance {tolerance}); \
             this may indicate a memory leak in parse_xdr"
        );
    }

    /// Same check for the zero-copy path.
    #[test]
    fn parse_xdr_zero_copy_net_allocations_do_not_grow_between_windows() {
        let xdr = make_xdr();
        let window = 500;
        let warmup = 50;

        let (net1, bytes1) = measure(warmup, window, || {
            let _ = parse_xdr_zero_copy(xdr.as_bytes());
        });

        let (net2, bytes2) = measure(0, window, || {
            let _ = parse_xdr_zero_copy(xdr.as_bytes());
        });

        println!("\n=== parse_xdr_zero_copy memory leak check ===");
        println!("  window size : {window} iterations");
        println!("  window 1 – net allocs: {net1}, bytes: {bytes1}");
        println!("  window 2 – net allocs: {net2}, bytes: {bytes2}");

        let tolerance = (net1 as f64 * 1.20) as usize + 10;
        assert!(
            net2 <= tolerance,
            "net allocations grew from {net1} to {net2} between windows (tolerance {tolerance}); \
             this may indicate a memory leak in parse_xdr_zero_copy"
        );
    }

    /// Bytes allocated per iteration must stay below a reasonable ceiling.
    ///
    /// A single XDR parse should never allocate more than 64 KiB of heap
    /// per call on average.
    #[test]
    fn bytes_per_parse_xdr_iteration_within_ceiling() {
        let xdr = make_xdr();
        let iterations = 1_000;
        let warmup = 100;

        let (_, bytes) = measure(warmup, iterations, || {
            let _ = parse_xdr(&xdr);
        });

        let bytes_per_iter = bytes / iterations;
        let ceiling = 64 * 1024; // 64 KiB

        println!("\n=== bytes per parse_xdr iteration ===");
        println!("  iterations      : {iterations}");
        println!("  total bytes     : {bytes}");
        println!("  bytes/iteration : {bytes_per_iter}");
        println!("  ceiling         : {ceiling}");

        assert!(
            bytes_per_iter <= ceiling,
            "bytes per iteration ({bytes_per_iter}) exceeds ceiling ({ceiling})"
        );
    }

    /// Bytes allocated per iteration for the zero-copy path must stay below
    /// the same ceiling.
    #[test]
    fn bytes_per_parse_xdr_zero_copy_iteration_within_ceiling() {
        let xdr = make_xdr();
        let iterations = 1_000;
        let warmup = 100;

        let (_, bytes) = measure(warmup, iterations, || {
            let _ = parse_xdr_zero_copy(xdr.as_bytes());
        });

        let bytes_per_iter = bytes / iterations;
        let ceiling = 64 * 1024;

        println!("\n=== bytes per parse_xdr_zero_copy iteration ===");
        println!("  iterations      : {iterations}");
        println!("  total bytes     : {bytes}");
        println!("  bytes/iteration : {bytes_per_iter}");
        println!("  ceiling         : {ceiling}");

        assert!(
            bytes_per_iter <= ceiling,
            "bytes per iteration ({bytes_per_iter}) exceeds ceiling ({ceiling})"
        );
    }

    /// Rejected (oversized) payloads must not leak memory.
    #[test]
    fn rejected_oversized_payloads_do_not_leak() {
        use crate::xdr::MAX_XDR_INPUT_BYTES;

        let oversized = "A".repeat(MAX_XDR_INPUT_BYTES + 1);
        let iterations = 500;
        let warmup = 50;

        let (net1, _) = measure(warmup, iterations, || {
            let _ = parse_xdr(&oversized);
        });

        let (net2, _) = measure(0, iterations, || {
            let _ = parse_xdr(&oversized);
        });

        println!("\n=== rejected payload memory leak check ===");
        println!("  window 1 net allocs: {net1}");
        println!("  window 2 net allocs: {net2}");

        let tolerance = (net1 as f64 * 1.20) as usize + 10;
        assert!(
            net2 <= tolerance,
            "net allocations grew from {net1} to {net2} for rejected payloads; \
             this indicates a memory leak in the rejection path"
        );
    }
}
