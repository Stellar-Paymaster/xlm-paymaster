# Fuzz Testing the Transaction XDR Parser (#718)

cargo-fuzz targets for `paymaster-server/src/xdr.rs` to discover memory leaks and edge cases in XDR parsing.

## Prerequisites

```bash
rustup default nightly
cargo install cargo-fuzz
```

## Fuzz targets

| Target | Input | Entry point |
|--------|-------|-------------|
| `fuzz_parse_xdr_from_bytes` | Raw bytes | `parse_xdr_from_bytes` |
| `fuzz_parse_xdr_base64` | UTF-8 base64 strings | `parse_xdr` |
| `fuzz_validate_xdr_input` | UTF-8 strings | `validate_xdr_input` |

## Running

```bash
cd paymaster-server

# Run a single target for 60 seconds
cargo +nightly fuzz run fuzz_parse_xdr_from_bytes -- -max_total_time=60

# Run all targets briefly
for t in fuzz_parse_xdr_from_bytes fuzz_parse_xdr_base64 fuzz_validate_xdr_input; do
  cargo +nightly fuzz run "$t" -- -max_total_time=30
done
```

## Architecture

The `xdr` module is exposed from `paymaster-server` library (`lib.rs`) so fuzz harnesses can depend on it. The binary re-exports via `pub use paymaster_server::xdr`.

All parser functions return `Result` — no panics on malformed input. Fuzzing validates this invariant under arbitrary byte inputs up to 64 KiB.

## Unit tests (baseline)

```bash
cd paymaster-server
cargo test xdr
```

Existing unit tests in `src/xdr.rs` cover valid envelopes, invalid base64, oversized payloads, and zero-copy paths.
