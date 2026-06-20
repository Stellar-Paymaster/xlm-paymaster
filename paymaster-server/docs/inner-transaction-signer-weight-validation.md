# Inner Transaction Signer Weight Pre-flight Validation (#686)

Before the Rust fee-bump relay wraps a signed inner transaction, it validates that the inner envelope's signature weight meets the source account's `med_threshold` on the Stellar network.

## Flow

1. Decode the submitted inner `TransactionEnvelope::Tx`.
2. Resolve the classic ed25519 source account id (`G…`).
3. Fetch `thresholds` and `signers` from Horizon (`GET /accounts/{id}`).
4. Match each `DecoratedSignature` hint against configured ed25519 signers and sum weights.
5. Reject with `INSUFFICIENT_SIGNATURE_WEIGHT` when `total_weight < med_threshold`.

## Error codes

| Code | When |
|------|------|
| `INSUFFICIENT_SIGNATURE_WEIGHT` | Signatures present but total weight is below `med_threshold`, or no hint matches account signers |
| `UNSUPPORTED_SOURCE_ACCOUNT` | Muxed / V0 / fee-bump envelopes (not supported for this check) |
| `ACCOUNT_NOT_FOUND` | Horizon returns 404 for the source account |
| `HORIZON_LOOKUP_FAILED` | Horizon cluster unavailable or returned a non-retryable error |

## Configuration

Validation runs when at least one Horizon URL is configured (`STELLAR_HORIZON_URL` or `STELLAR_HORIZON_URLS`). If Horizon is not configured, the relay skips this check (local/dev only).

## Implementation

- `fluid-server/src/signer_weight.rs` – pure validation + unit tests
- `fluid-server/src/horizon.rs` – `fetch_account_auth`
- `fluid-server/src/main.rs` – invoked in `process_fee_bump_request` before signing
