# WASM Signing Out-Of-Memory Protections

**Issue #695 | Resilience & Error Handling | `fluid-server`**

## Overview

The client-side WASM signing bundle runs inside a constrained WebAssembly
linear memory heap.  Processing an abnormally large XDR payload can exhaust
allocator capacity and produce an unrecoverable OOM trap instead of a clean
JavaScript exception.

This document describes the memory threshold enforcement added to
`fluid-server/src/lib.rs`.

## Implementation

### Hard XDR Size Ceiling

A compile-time constant `MAX_XDR_BYTES` (default **64 KiB**) is checked
**before** any `base64::decode` or `stellar-xdr` parse call:

```rust
// fluid-server/src/lib.rs
const MAX_XDR_BYTES: usize = 64 * 1024;

fn check_xdr_size(xdr: &str) -> Result<(), SigningError> {
    let byte_len = xdr.len();
    if byte_len > MAX_XDR_BYTES {
        return Err(SigningError::InvalidEnvelope(format!(
            "XDR payload is {byte_len} bytes, which exceeds the maximum allowed \
             size of {MAX_XDR_BYTES} bytes."
        )));
    }
    Ok(())
}
```

The check is applied at two entry points:

| Entry point | Guard location |
|-------------|---------------|
| `sign_transaction_xdr` (WASM export) | First line, before any heap use |
| `sign_transaction_xdr_internal` (internal impl) | First line, before signer context |

### Why 64 KiB?

A maximally-packed Stellar `TransactionEnvelope` (100 operations, large memos,
all signatures) encodes to roughly **12–15 KiB** of base64.  64 KiB provides
4× headroom for unusual payloads while remaining far below the WASM default
heap limit of 1 MiB.

## Error Behaviour

Oversized payloads surface as a `JsValue` string exception in JavaScript:

```
Error: invalid transaction envelope: XDR payload is 65537 bytes, which exceeds
the maximum allowed size of 65536 bytes.
```

This is catchable via a normal `try/catch` and will never produce an OOM trap.

## Test Coverage

Unit tests live in `fluid-server/src/lib.rs` (`mod tests`):

- `check_xdr_size_accepts_valid_payload`
- `check_xdr_size_rejects_oversized_payload`
- `check_xdr_size_accepts_exact_limit`
- `sign_transaction_xdr_internal_rejects_oversized_xdr`

Run with:

```bash
cd fluid-server && cargo test
```
