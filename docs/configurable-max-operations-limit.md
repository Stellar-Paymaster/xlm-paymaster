# Configurable Maximum Operations Limit

**Issue #697 | Resilience & Error Handling | `fluid-server`**

## Overview

A single Stellar transaction envelope may contain up to 100 operations.
Without an application-level guard, a malformed or adversarial request could
submit pathologically large envelopes that slow the fee-bump relay or exhaust
signer pool capacity.

This document describes the configurable operation-count limit added to the
`fluid-server` Rust binary.

## Configuration

| Environment Variable | Type | Default | Description |
|----------------------|------|---------|-------------|
| `FLUID_MAX_OPERATIONS_PER_ENVELOPE` | `usize` | `100` | Max operations per sponsored envelope |

Set in `.env` or the deployment environment:

```env
# Restrict to 20 ops per envelope for high-security deployments
FLUID_MAX_OPERATIONS_PER_ENVELOPE=20
```

## Implementation

### `Config` struct (`config.rs`)

```rust
pub struct Config {
    // …existing fields…
    /// Maximum number of operations allowed inside a single sponsored
    /// transaction envelope.  Configured via FLUID_MAX_OPERATIONS_PER_ENVELOPE.
    pub max_operations_per_envelope: usize,
}
```

### Enforcement (`main.rs` – `process_fee_bump_request`)

The check runs **before** acquiring a signer lease, so no resource is held
during the validation:

```rust
if count > state.config.max_operations_per_envelope {
    return Err(AppError::new(
        StatusCode::BAD_REQUEST,
        "TOO_MANY_OPERATIONS",
        format!("Transaction contains {count} operations, exceeds limit of {limit}."),
    ));
}
```

### HTTP response

```json
{
  "code": "TOO_MANY_OPERATIONS",
  "error": "Transaction contains 105 operations, which exceeds the configured maximum of 100 per envelope (FLUID_MAX_OPERATIONS_PER_ENVELOPE)."
}
```

HTTP status: **400 Bad Request**

## Test Coverage

Unit tests in `config.rs`:

- `load_config_max_operations_default_and_override` – verifies default of 100
  and that a custom value (25) is read correctly.

Run:

```bash
cd fluid-server && cargo test config
```
