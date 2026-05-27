# Offline Signing for Cold Sweeps

**Issue:** #520 · Architectural & Product Expansion  
**File:** `src/services/offlineSigning.ts`

## Overview

Cold treasury sweeps move large amounts of XLM between accounts. These transactions must be signed by keys stored on air-gapped hardware wallets or cold-storage computers that never touch the internet.

The offline signing module implements a QR-code–based signing workflow:

```
┌──────────────┐     QR (request)    ┌──────────────────┐
│  Hot Server  │ ────────────────►  │  Air-gapped       │
│  (online)    │                     │  Signing Device   │
│              │ ◄────────────────  │  (offline)        │
└──────────────┘     QR (response)   └──────────────────┘
```

## Flow

### 1. Server creates a signing request

```typescript
import { createSigningRequest } from "./offlineSigning";

const { qrPayload, nonce, expiresAt } = createSigningRequest({
  transactionXdr: unsignedTx.toXDR(),
  networkPassphrase: Networks.PUBLIC,
  signerPublicKey: "GCOLD...",
  label: "Treasury sweep 2024-01-01 — 50,000 XLM",
});

// Display qrPayload as a QR code to the operator
```

### 2. Air-gapped device decodes, signs, and encodes the response

```typescript
// On the air-gapped machine:
const req = decodeSigningRequestQR(qrPayload);
const tx = TransactionBuilder.fromXDR(req.transactionXdr, req.networkPassphrase);
tx.sign(coldStorageKeypair);

const responseQR = encodeSigningResponseQR({
  nonce: req.nonce,
  signature: coldStorageKeypair.sign(tx.hash()).toString("hex"),
  signedTransactionXdr: tx.toXDR(),
});
// Display responseQR as a QR code
```

### 3. Server validates and broadcasts

```typescript
const { signedTransactionXdr } = submitSigningResponse(
  decodeSigningResponseQR(scannedResponseQR)
);

// Broadcast with the Horizon failover client
await horizonClient.submitTransaction(
  TransactionBuilder.fromXDR(signedTransactionXdr, Networks.PUBLIC)
);
```

## Security guarantees

| Property | Implementation |
|---|---|
| **Expiry** | Requests expire after `OFFLINE_SIGNING_TTL_MS` (default 15 min) |
| **Single-use nonces** | Replayed responses are rejected with "already been used" |
| **Signature verification** | Ed25519 via Stellar SDK — invalid signatures raise immediately |
| **XDR validation** | Malformed XDR is rejected before signature check |
| **Audit trail** | Every create/submit/cancel is written to the audit log |
| **Capacity limit** | Max `OFFLINE_SIGNING_MAX_PENDING` concurrent requests (default 500) |

## API Reference

| Function | Description |
|---|---|
| `createSigningRequest(params)` | Create a signing request and return a QR payload |
| `decodeSigningRequestQR(payload)` | Decode a request QR (air-gapped side) |
| `verifyTransactionSignature(params)` | Standalone Ed25519 verification |
| `submitSigningResponse(response)` | Validate and accept a signed response |
| `encodeSigningResponseQR(response)` | Encode a response as a QR payload |
| `decodeSigningResponseQR(payload)` | Decode a response QR (server side) |
| `listPendingRequests()` | List non-expired pending requests |
| `cancelSigningRequest(nonce)` | Cancel a pending request |

## Configuration

| Env variable | Default | Description |
|---|---|---|
| `OFFLINE_SIGNING_TTL_MS` | `900000` (15 min) | Time-to-live for signing requests |
| `OFFLINE_SIGNING_MAX_PENDING` | `500` | Maximum concurrent pending requests |

## Edge cases

- **Expired request**: `submitSigningResponse` throws `expired` and removes it from pending.
- **Wrong signer**: If the signed XDR was signed by a different key than declared, verification fails.
- **Capacity overflow**: When `MAX_PENDING` is reached, `createSigningRequest` throws to prevent DoS.
- **Double-submit**: The nonce is added to a used-nonce set; the second call is rejected immediately.
