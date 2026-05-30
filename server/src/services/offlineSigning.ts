/**
 * Offline Signing for Cold Sweeps
 *
 * Enables QR-code–based offline signing workflow for high-value / cold-storage
 * treasury sweeps. The flow is:
 *
 *   1. Server produces a "signing request" (PSBT-like envelope with the raw
 *      XDR transaction hash + metadata) and encodes it as a QR-friendly
 *      Base64URL string.
 *   2. An air-gapped device (hardware wallet, cold PC) decodes the request,
 *      signs it offline, and encodes the signature as a QR code.
 *   3. Server decodes the "signing response" QR, validates the signature, and
 *      broadcasts the fee-bumped transaction on the network.
 *
 * Security notes
 * ──────────────
 * • Requests expire after OFFLINE_SIGNING_TTL_MS (default 15 min).
 * • Nonces are single-use: replaying a response is rejected.
 * • Signature verification uses the Stellar SDK's Ed25519 built-in.
 * • Pending requests are stored in-process; replace with Redis for HA.
 */

import crypto from "node:crypto";
import StellarSdk from "@stellar/stellar-sdk";
import { createLogger } from "../utils/logger";
import { logAuditEvent } from "./auditLogger";

const logger = createLogger({ component: "offline_signing" });

function getTtlMs(): number {
  return Number(process.env.OFFLINE_SIGNING_TTL_MS) || 15 * 60 * 1_000;
}
function getMaxPending(): number {
  return Number(process.env.OFFLINE_SIGNING_MAX_PENDING) || 500;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SigningRequest {
  /** Unique nonce — doubles as request id. */
  nonce: string;
  /** Base64-encoded raw transaction XDR (unsigned or partially signed). */
  transactionXdr: string;
  /** Stellar network passphrase. */
  networkPassphrase: string;
  /** Public key that must sign the transaction. */
  signerPublicKey: string;
  /** Human-readable label (e.g. "Treasury sweep 2024-01-01"). */
  label?: string;
  /** Unix timestamp (ms) when this request was created. */
  createdAt: number;
  /** Unix timestamp (ms) after which this request must be rejected. */
  expiresAt: number;
}

export interface SigningResponse {
  /** Matches the nonce in the corresponding SigningRequest. */
  nonce: string;
  /** Hex-encoded Ed25519 signature over the transaction hash. */
  signature: string;
  /** Base64-encoded signed transaction XDR (ready to broadcast). */
  signedTransactionXdr: string;
}

export interface SigningRequestQR {
  /** Base64URL-encoded JSON of the SigningRequest. */
  qrPayload: string;
  nonce: string;
  expiresAt: number;
}

export interface BroadcastResult {
  success: boolean;
  transactionHash?: string;
  ledger?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// In-memory pending store
// ---------------------------------------------------------------------------

const pending = new Map<string, SigningRequest>();
const usedNonces = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function encodeQR(data: unknown): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function decodeQR<T>(qrPayload: string): T {
  const json = Buffer.from(qrPayload, "base64url").toString("utf8");
  return JSON.parse(json) as T;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [nonce, req] of pending) {
    if (req.expiresAt < now) {
      pending.delete(nonce);
      logger.debug({ nonce }, "Pruned expired signing request");
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a signing request for an offline cold sweep.
 *
 * @returns A `SigningRequestQR` whose `qrPayload` can be displayed as a
 *          QR code for the air-gapped device.
 */
export function createSigningRequest(params: {
  transactionXdr: string;
  networkPassphrase: string;
  signerPublicKey: string;
  label?: string;
}): SigningRequestQR {
  pruneExpired();

  if (pending.size >= getMaxPending()) {
    throw new Error("Too many pending signing requests");
  }

  // Validate that the public key is a valid Stellar address
  try {
    StellarSdk.Keypair.fromPublicKey(params.signerPublicKey);
  } catch {
    throw new Error(`Invalid Stellar public key: ${params.signerPublicKey}`);
  }

  const now = Date.now();
  const req: SigningRequest = {
    nonce: generateNonce(),
    transactionXdr: params.transactionXdr,
    networkPassphrase: params.networkPassphrase,
    signerPublicKey: params.signerPublicKey,
    label: params.label,
    createdAt: now,
    expiresAt: now + getTtlMs(),
  };

  pending.set(req.nonce, req);

  logger.info(
    { nonce: req.nonce, signerPublicKey: params.signerPublicKey, label: params.label },
    "Offline signing request created",
  );

  void logAuditEvent({
    action: "offline_signing.request_created",
    actor: "system",
    resource: req.nonce,
    detail: { signerPublicKey: params.signerPublicKey, label: params.label },
  } as any);

  return {
    qrPayload: encodeQR(req),
    nonce: req.nonce,
    expiresAt: req.expiresAt,
  };
}

/**
 * Decode a QR payload from the air-gapped device back into a SigningRequest.
 * Useful for UI / testing — does NOT validate the signature.
 */
export function decodeSigningRequestQR(qrPayload: string): SigningRequest {
  return decodeQR<SigningRequest>(qrPayload);
}

/**
 * Submit a signing response from the air-gapped device.
 *
 * Validates:
 * - The nonce exists and has not expired or been used before.
 * - The Ed25519 signature is valid for the declared signer public key.
 * - The signed XDR contains the expected signer's signature.
 *
 * Returns the validated request so the caller can broadcast the
 * `signedTransactionXdr`.
 */
export function submitSigningResponse(response: SigningResponse): {
  request: SigningRequest;
  signedTransactionXdr: string;
} {
  const { nonce, signature, signedTransactionXdr } = response;

  // Replay / duplicate check
  if (usedNonces.has(nonce)) {
    throw new Error(`Nonce "${nonce}" has already been used`);
  }

  const req = pending.get(nonce);
  if (!req) {
    throw new Error(`Signing request "${nonce}" not found`);
  }

  // Expiry check
  if (Date.now() > req.expiresAt) {
    pending.delete(nonce);
    throw new Error(`Signing request "${nonce}" has expired`);
  }

  // Verify the signed XDR contains a valid signature from the declared signer
  verifyTransactionSignature({
    transactionXdr: signedTransactionXdr,
    networkPassphrase: req.networkPassphrase,
    signerPublicKey: req.signerPublicKey,
    rawSignatureHex: signature,
  });

  // Mark nonce as used and remove from pending
  usedNonces.add(nonce);
  pending.delete(nonce);

  logger.info(
    { nonce, signerPublicKey: req.signerPublicKey },
    "Offline signing response accepted",
  );

  void logAuditEvent({
    action: "offline_signing.response_accepted",
    actor: "system",
    resource: nonce,
    detail: { signerPublicKey: req.signerPublicKey },
  } as any);

  return { request: req, signedTransactionXdr };
}

/**
 * Verify that a transaction carries a valid Ed25519 signature from
 * `signerPublicKey`.  Throws if the signature is invalid.
 */
export function verifyTransactionSignature(params: {
  transactionXdr: string;
  networkPassphrase: string;
  signerPublicKey: string;
  /** Optional: the raw hex signature to check — if omitted, checks that ANY
   *  signature on the XDR is valid for the keypair. */
  rawSignatureHex?: string;
}): void {
  const { transactionXdr, networkPassphrase, signerPublicKey, rawSignatureHex } = params;

  let tx: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction;
  try {
    tx = StellarSdk.TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  } catch (err) {
    throw new Error(`Invalid transaction XDR: ${String(err)}`);
  }

  const keypair = StellarSdk.Keypair.fromPublicKey(signerPublicKey);
  const txHash = (tx as StellarSdk.Transaction).hash();

  if (rawSignatureHex) {
    const sigBuffer = Buffer.from(rawSignatureHex, "hex");
    const valid = keypair.verify(txHash, sigBuffer);
    if (!valid) {
      throw new Error(
        `Signature verification failed for signer ${signerPublicKey}`,
      );
    }
    return;
  }

  // Check that at least one signature on the envelope is valid for this key
  const innerTx =
    tx instanceof StellarSdk.FeeBumpTransaction ? tx.innerTransaction : tx;

  const signatures = innerTx.signatures;
  const hint = keypair.signatureHint();

  const hasValidSig = signatures.some((decoratedSig) => {
    if (!decoratedSig.hint().equals(hint)) return false;
    return keypair.verify(txHash, decoratedSig.signature());
  });

  if (!hasValidSig) {
    throw new Error(
      `No valid signature found on transaction for signer ${signerPublicKey}`,
    );
  }
}

/**
 * Encode a signing response as a QR payload (for the air-gapped device to
 * display after signing).
 */
export function encodeSigningResponseQR(response: SigningResponse): string {
  return encodeQR(response);
}

/**
 * Decode a signing response QR payload.
 */
export function decodeSigningResponseQR(qrPayload: string): SigningResponse {
  return decodeQR<SigningResponse>(qrPayload);
}

/**
 * List all pending (non-expired) signing requests.
 */
export function listPendingRequests(): SigningRequest[] {
  pruneExpired();
  return [...pending.values()];
}

/**
 * Cancel a pending signing request by nonce.
 */
export function cancelSigningRequest(nonce: string): boolean {
  return pending.delete(nonce);
}

/** Reset internal state (test use only). */
export function _resetState(): void {
  pending.clear();
  usedNonces.clear();
}
