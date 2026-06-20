# XDR Input Size and Structure Validation

## Overview

The Fluid server hardens XDR transaction input processing against memory-exhaustion attacks by validating payload shape before expensive deserialization and heap allocation.

## Attack Surface

The `/fee-bump` and `/fee-bump/batch` endpoints accept base64-encoded XDR transaction envelopes and deserialize them using the Stellar XDR library. Untrusted clients can submit:

1. **Oversized payloads**: Payloads exceeding the configured maximum, causing large base64 decode allocations.
2. **Invalid base64**: Strings with non-base64 characters, potentially triggering expensive error-recovery logic.
3. **Malformed XDR**: Valid base64 that decodes to invalid XDR bytes, triggering parsing failure after full deserialization.

The attack occurs between the HTTP router and the `xdr::parse_xdr` function:
- HTTP body acceptance (no size limit imposed by default).
- Base64 decode allocation (typically 3/4 of the encoded length).
- XDR deserialization (recursive structure parsing).

## Mitigation Strategy

### Input Validation Gate

The `validate_xdr_input` function in `fluid-server/src/xdr.rs` performs a **cheap preflight check** before any decode or deserialization work:

```rust
pub fn validate_xdr_input(base64_string: &str) -> Result<&str, XdrError> {
    let trimmed = base64_string.trim();

    if trimmed.is_empty() {
        return Err(XdrError::InvalidBase64("XDR payload is empty".to_string()));
    }

    if trimmed.len() > MAX_XDR_INPUT_BYTES {
        return Err(XdrError::PayloadTooLarge { actual: trimmed.len(), max: MAX_XDR_INPUT_BYTES });
    }

    if !trimmed.bytes().all(is_standard_base64_byte) {
        return Err(XdrError::InvalidBase64("...".to_string()));
    }

    Ok(trimmed)
}
```

### Configuration

- **`MAX_XDR_INPUT_BYTES`**: Hard ceiling for the encoded XDR payload, set to **64 KB** (`64 * 1024`).
  - This is the base64-encoded size, not the decoded size. A 64 KB base64 string decodes to ~48 KB of binary data.
  - Rationale: Real Stellar transactions are typically 1–5 KB encoded. 64 KB provides a 10–100x safety margin for complex multi-operation transactions while rejecting obvious resource-exhaustion attempts.

### Deployment Locations

1. **`fluid-server/src/xdr.rs`**:
   - `validate_xdr_input`: The validation gate.
   - `parse_xdr`: Called via the gate and uses the validated, trimmed string.
   - `parse_xdr_zero_copy`: Also includes inline size/base64 validation.

2. **`fluid-server/src/stellar.rs`**:
   - `create_fee_bump_transaction`: Calls `validate_xdr_input` as the first operation, before attempting any decode or XDR deserialization.

3. **`fluid-server/src/main.rs`**:
   - `process_fee_bump_request`: Routes XDR input to `create_fee_bump_transaction`, which now validates before deserializing.

### Error Responses

If input validation fails, the server returns a structured error with HTTP 400 (Bad Request):

```json
{
  "code": "INVALID_XDR",
  "error": "XDR payload is 65536 bytes, which exceeds the maximum allowed size of 65536 bytes"
}
```

Possible error messages:
- `"XDR payload is empty"`
- `"XDR payload is <N> bytes, which exceeds the maximum allowed size of <M> bytes"`
- `"XDR payload must contain only standard base64 characters"`

## Testing

The test suite covers both positive and negative cases:

### Positive Cases
- `test_zero_copy_parsing`: Verifies valid XDR decoding.
- `test_parse_from_bytes`: Verifies bytes-based parsing.
- `test_zero_copy_decoder`: Verifies low-level base64 decoding.

### Negative Cases
- `test_validate_xdr_input_rejects_oversized_payload`: 65 KB payload → `PayloadTooLarge` error.
- `test_validate_xdr_input_rejects_invalid_base64_chars`: Non-base64 characters → `InvalidBase64` error.
- `test_validate_xdr_input_rejects_empty_string`: Empty string → `InvalidBase64` error.
- `test_validate_xdr_input_accepts_whitespace_padded_valid_base64`: Whitespace-padded input → accepted after trimming.
- `test_parse_xdr_with_oversized_payload`: Full path with oversized input → rejected before decode.
- `test_parse_zero_copy_with_oversized_payload`: Zero-copy path with oversized input → rejected before decode.

## Verification

To verify the hardening:

1. **Build the server**:
   ```bash
   cargo build --release
   ```

2. **Run tests**:
   ```bash
   cargo test --lib xdr
   ```

3. **Manual test: Oversized payload**:
   ```bash
   XDR_OVERSIZED=$(python3 -c "import base64; print('A' * 65536)")
   curl -X POST http://localhost:3000/fee-bump \
     -H "Content-Type: application/json" \
     -d "{\"xdr\": \"$XDR_OVERSIZED\", \"submit\": false}"
   # Expected: 400 Bad Request with INVALID_XDR code.
   ```

4. **Manual test: Invalid base64**:
   ```bash
   curl -X POST http://localhost:3000/fee-bump \
     -H "Content-Type: application/json" \
     -d '{"xdr": "not!!!valid===base64", "submit": false}'
   # Expected: 400 Bad Request with INVALID_XDR code.
   ```

5. **Manual test: Valid transaction (should work)**:
   ```bash
   curl -X POST http://localhost:3000/fee-bump \
     -H "Content-Type: application/json" \
     -d '{"xdr": "<valid-stellar-xdr>", "submit": false}'
   # Expected: 200 OK with fee-bump-ready response.
   ```

## Impact

- **Security**: Prevents memory exhaustion and parsing panics from untrusted XDR input.
- **Performance**: The validation gate is O(n) in the input length (single pass to check base64 chars), which is negligible compared to base64 decode and XDR deserialization.
- **Compatibility**: Rejects no valid Stellar transactions. The 64 KB limit is conservative for production Stellar transaction sizes.
