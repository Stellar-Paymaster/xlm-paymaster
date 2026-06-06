import { describe, expect, it } from "vitest";
import {
  calculateWebhookNextAttempt,
  calculateWebhookNextAttemptMs,
  isWebhookRetryDue,
  millisecondsUntilNextWebhookRetry,
  shouldRetryWebhookDelivery,
  webhookBackoffDelaySequence,
  WEBHOOK_RETRY_CONFIG,
} from "./webhookBackoff";

describe("webhookBackoff", () => {
  const baseNow = new Date("2026-06-01T12:00:00.000Z").getTime();

  describe("calculateWebhookNextAttemptMs", () => {
    it("uses 1-minute base delay for the first retry (attempt 0)", () => {
      expect(
        calculateWebhookNextAttemptMs({ attemptsMade: 0, nowMs: baseNow }),
      ).toBe(baseNow + 60_000);
    });

    it("doubles delay for each subsequent attempt (exponential backoff)", () => {
      expect(
        calculateWebhookNextAttemptMs({ attemptsMade: 1, nowMs: baseNow }),
      ).toBe(baseNow + 120_000);
      expect(
        calculateWebhookNextAttemptMs({ attemptsMade: 2, nowMs: baseNow }),
      ).toBe(baseNow + 240_000);
      expect(
        calculateWebhookNextAttemptMs({ attemptsMade: 3, nowMs: baseNow }),
      ).toBe(baseNow + 480_000);
    });

    it("respects custom baseDelayMs", () => {
      expect(
        calculateWebhookNextAttemptMs({
          attemptsMade: 2,
          baseDelayMs: 1_000,
          nowMs: baseNow,
        }),
      ).toBe(baseNow + 4_000);
    });

    it("treats negative attemptsMade as attempt 0", () => {
      expect(
        calculateWebhookNextAttemptMs({ attemptsMade: -1, nowMs: baseNow }),
      ).toBe(baseNow + WEBHOOK_RETRY_CONFIG.baseDelayMs);
    });

    it("returns a Date from calculateWebhookNextAttempt", () => {
      const next = calculateWebhookNextAttempt({
        attemptsMade: 1,
        nowMs: baseNow,
      });
      expect(next).toBeInstanceOf(Date);
      expect(next.getTime()).toBe(baseNow + 120_000);
    });
  });

  describe("webhookBackoffDelaySequence", () => {
    it("generates the expected delay sequence for 5 attempts", () => {
      expect(webhookBackoffDelaySequence(5, 60_000)).toEqual([
        60_000,
        120_000,
        240_000,
        480_000,
        960_000,
      ]);
    });

    it("returns empty array for zero max attempts", () => {
      expect(webhookBackoffDelaySequence(0)).toEqual([]);
    });
  });

  describe("shouldRetryWebhookDelivery", () => {
    it("allows retries while attemptsMade is below maxAttempts", () => {
      expect(shouldRetryWebhookDelivery(0)).toBe(true);
      expect(shouldRetryWebhookDelivery(4)).toBe(true);
    });

    it("blocks retries once maxAttempts is reached", () => {
      expect(shouldRetryWebhookDelivery(5)).toBe(false);
      expect(shouldRetryWebhookDelivery(6)).toBe(false);
    });
  });

  describe("isWebhookRetryDue", () => {
    it("returns true when nextAttempt is null or undefined", () => {
      expect(isWebhookRetryDue(null)).toBe(true);
      expect(isWebhookRetryDue(undefined)).toBe(true);
    });

    it("returns false before the scheduled retry time", () => {
      const nextAttempt = new Date("2026-06-01T12:05:00.000Z");
      const now = new Date("2026-06-01T12:04:59.000Z");
      expect(isWebhookRetryDue(nextAttempt, now)).toBe(false);
    });

    it("returns true at or after the scheduled retry time", () => {
      const nextAttempt = new Date("2026-06-01T12:05:00.000Z");
      expect(isWebhookRetryDue(nextAttempt, new Date("2026-06-01T12:05:00.000Z"))).toBe(true);
      expect(isWebhookRetryDue(nextAttempt, new Date("2026-06-01T12:06:00.000Z"))).toBe(true);
    });
  });

  describe("millisecondsUntilNextWebhookRetry", () => {
    it("returns positive ms when retry is in the future", () => {
      const nextAttempt = new Date("2026-06-01T12:05:00.000Z");
      const now = new Date("2026-06-01T12:00:00.000Z");
      expect(millisecondsUntilNextWebhookRetry(nextAttempt, now)).toBe(300_000);
    });

    it("returns negative ms when retry is overdue", () => {
      const nextAttempt = new Date("2026-06-01T12:00:00.000Z");
      const now = new Date("2026-06-01T12:01:00.000Z");
      expect(millisecondsUntilNextWebhookRetry(nextAttempt, now)).toBe(-60_000);
    });
  });

  describe("exponential backoff monotonicity", () => {
    it("delay never decreases as attemptsMade increases", () => {
      const baseDelayMs = 1_000;
      for (let low = 0; low <= 10; low += 1) {
        for (let high = low; high <= 10; high += 1) {
          const delayLow = calculateWebhookNextAttemptMs({
            baseDelayMs,
            attemptsMade: low,
            nowMs: 0,
          });
          const delayHigh = calculateWebhookNextAttemptMs({
            baseDelayMs,
            attemptsMade: high,
            nowMs: 0,
          });
          expect(delayHigh).toBeGreaterThanOrEqual(delayLow);
        }
      }
    });
  });

  describe("integration with BullMQ queue config", () => {
    it("matches the webhook queue defaultJobOptions backoff settings", () => {
      const delays = webhookBackoffDelaySequence(
        WEBHOOK_RETRY_CONFIG.attempts,
        WEBHOOK_RETRY_CONFIG.baseDelayMs,
      );

      expect(WEBHOOK_RETRY_CONFIG.backoffType).toBe("exponential");
      expect(delays[0]).toBe(WEBHOOK_RETRY_CONFIG.baseDelayMs);
      expect(delays).toHaveLength(WEBHOOK_RETRY_CONFIG.maxAttempts);
    });
  });
});
