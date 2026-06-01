/**
 * Webhook retry backoff helpers (#723)
 *
 * BullMQ uses exponential backoff with a configurable base delay.
 * These helpers compute the next retry timestamp and validate timing.
 */

/** Default webhook queue retry configuration. */
export const WEBHOOK_RETRY_CONFIG = {
  attempts: 5,
  backoffType: "exponential" as const,
  /** Initial delay in milliseconds (1 minute). */
  baseDelayMs: 60_000,
  maxAttempts: 5,
};

export interface WebhookBackoffOptions {
  baseDelayMs?: number;
  /** Current attempt index (0-based, matches BullMQ job.attemptsMade). */
  attemptsMade: number;
  /** Reference timestamp for computing next attempt (default: Date.now()). */
  nowMs?: number;
}

/**
 * Compute the next webhook delivery attempt timestamp using exponential backoff.
 *
 * Formula: now + baseDelayMs * 2^attemptsMade
 *
 * Attempt 0 → +1 min, attempt 1 → +2 min, attempt 2 → +4 min, etc.
 */
export function calculateWebhookNextAttemptMs(
  options: WebhookBackoffOptions,
): number {
  const baseDelayMs = options.baseDelayMs ?? WEBHOOK_RETRY_CONFIG.baseDelayMs;
  const nowMs = options.nowMs ?? Date.now();
  const exponent = Math.max(0, options.attemptsMade);
  const delayMs = baseDelayMs * Math.pow(2, exponent);
  return nowMs + delayMs;
}

export function calculateWebhookNextAttempt(
  options: WebhookBackoffOptions,
): Date {
  return new Date(calculateWebhookNextAttemptMs(options));
}

/**
 * Returns true when a failed delivery should still be retried.
 */
export function shouldRetryWebhookDelivery(
  attemptsMade: number,
  maxAttempts: number = WEBHOOK_RETRY_CONFIG.maxAttempts,
): boolean {
  return attemptsMade < maxAttempts;
}

/**
 * Milliseconds until the next retry is due (negative if overdue).
 */
export function millisecondsUntilNextWebhookRetry(
  nextAttempt: Date,
  now: Date = new Date(),
): number {
  return nextAttempt.getTime() - now.getTime();
}

/**
 * Validates that a delivery respects configured backoff before retrying.
 * Returns true when the next attempt time has been reached.
 */
export function isWebhookRetryDue(
  nextAttempt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!nextAttempt) return true;
  return now.getTime() >= nextAttempt.getTime();
}

/**
 * Sequence of delay intervals (ms) for each retry attempt before max attempts.
 */
export function webhookBackoffDelaySequence(
  maxAttempts: number = WEBHOOK_RETRY_CONFIG.maxAttempts,
  baseDelayMs: number = WEBHOOK_RETRY_CONFIG.baseDelayMs,
): number[] {
  const delays: number[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    delays.push(baseDelayMs * Math.pow(2, attempt));
  }
  return delays;
}
