/**
 * Strict monotonic nonce guard for the signer.
 *
 * Tracks a high-water mark per signer public key and rejects any signing
 * attempt whose nonce is less than or equal to the previously recorded value.
 * This closes the replay-attack window that exists when a signer is asked to
 * re-sign a payload for a nonce it has already consumed.
 */

export class NonceReplayError extends Error {
  public readonly publicKey: string;
  public readonly attemptedNonce: bigint;
  public readonly lastNonce: bigint;

  constructor(publicKey: string, attemptedNonce: bigint, lastNonce: bigint) {
    super(
      `Nonce replay detected for ${publicKey}: attempted ${attemptedNonce.toString()} ` +
        `but last signed nonce was ${lastNonce.toString()}`,
    );
    this.name = "NonceReplayError";
    this.publicKey = publicKey;
    this.attemptedNonce = attemptedNonce;
    this.lastNonce = lastNonce;
    Error.captureStackTrace(this, this.constructor);
  }
}

export interface NonceGuardSnapshotEntry {
  publicKey: string;
  lastNonce: string;
}

function toBigInt(value: bigint | number | string): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`Nonce must be an integer, received ${value}`);
    }
    return BigInt(value);
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("Nonce must be a non-empty bigint, number, or string");
  }

  return BigInt(value);
}

export class NonceGuard {
  private readonly lastNonce = new Map<string, bigint>();

  /**
   * Validates that `nonce` is strictly greater than the last value recorded
   * for `publicKey` and, if so, records it as the new high-water mark.
   *
   * The check-and-record is atomic under JavaScript's single-threaded
   * execution model: no `await` appears between read and write.
   */
  assertAndRecord(publicKey: string, nonce: bigint | number | string): bigint {
    if (!publicKey) {
      throw new TypeError("publicKey is required");
    }

    const next = toBigInt(nonce);
    if (next < 0n) {
      throw new RangeError(`Nonce must be non-negative, received ${next.toString()}`);
    }

    const previous = this.lastNonce.get(publicKey);
    if (previous !== undefined && next <= previous) {
      throw new NonceReplayError(publicKey, next, previous);
    }

    this.lastNonce.set(publicKey, next);
    return next;
  }

  /**
   * Returns the last recorded nonce for a key, or `null` if the guard has
   * never observed this key.
   */
  peek(publicKey: string): bigint | null {
    const value = this.lastNonce.get(publicKey);
    return value ?? null;
  }

  /**
   * Seeds the high-water mark for a key — intended to be called on boot from a
   * persisted value so the guard fails closed across restarts. Setting a
   * baseline below the current value is rejected to preserve monotonicity.
   */
  initialize(publicKey: string, nonce: bigint | number | string): bigint {
    if (!publicKey) {
      throw new TypeError("publicKey is required");
    }

    const value = toBigInt(nonce);
    if (value < 0n) {
      throw new RangeError(`Nonce must be non-negative, received ${value.toString()}`);
    }

    const previous = this.lastNonce.get(publicKey);
    if (previous !== undefined && value < previous) {
      throw new NonceReplayError(publicKey, value, previous);
    }

    this.lastNonce.set(publicKey, value);
    return value;
  }

  /**
   * Clears tracking for a specific key (intended for key rotation or test
   * isolation) or for every key when invoked without arguments.
   */
  reset(publicKey?: string): void {
    if (publicKey === undefined) {
      this.lastNonce.clear();
      return;
    }

    this.lastNonce.delete(publicKey);
  }

  snapshot(): NonceGuardSnapshotEntry[] {
    return Array.from(this.lastNonce.entries()).map(([publicKey, lastNonce]) => ({
      publicKey,
      lastNonce: lastNonce.toString(),
    }));
  }
}
