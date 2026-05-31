# Soroban Smart Contract Execution – Integration Tests

**Issue #726 | Testing, Verification & Fuzzing | `fluid-server`**

## Overview

Verifies gasless fee-bump success with a mock Soroban contract invocation on
both Testnet and custom network-passphrase configurations.

## Test File

`fluid-server/tests/soroban_integration.rs`

## Test Cases

| Test | Description |
|------|-------------|
| `soroban_testnet_derives_correct_public_key` | Signs on Testnet passphrase; asserts known public key and signature count |
| `soroban_custom_passphrase_produces_different_hash` | Same XDR signed under Futurenet passphrase yields a different tx hash |
| `soroban_rejects_empty_xdr` | Empty XDR input is rejected cleanly |
| `soroban_rejects_malformed_xdr` | Non-base64 input surfaces a descriptive error, no panic |
| `soroban_rejects_invalid_secret_key` | Bad secret key returns `InvalidSecretKey` error |
| `soroban_signed_xdr_fixture_is_valid_base64` | Fixture XDR round-trips through base64 without corruption |

## Running

```bash
cd fluid-server
cargo test --test soroban_integration
```

## Design Notes

- Tests run against the **native** (non-WASM) library surface exposed by
  `fluid-server` — no live Horizon node or Soroban RPC required.
- The mock inner-transaction XDR is a pre-signed `TransactionV1` envelope
  built offline with the Stellar JS SDK; it is not an actual Soroban
  `InvokeHostFunction` XDR (which requires a full Soroban RPC to construct),
  but it exercises the full signing and hash derivation pipeline.
- Network isolation is verified by asserting that the same XDR produces
  different hashes under different passphrases.
