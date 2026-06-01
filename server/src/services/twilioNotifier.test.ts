import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwilioNotifier, createTwilioNotifier } from "./twilioNotifier";
import * as redisModule from "../utils/redis";

// Track the mock Twilio client
let mockTwilioCreate = vi.fn();

// Mock Twilio
vi.mock("twilio", () => {
  return {
    default: vi.fn(() => ({
      messages: {
        create: mockTwilioCreate,
      },
    })),
    __esModule: true,
  };
});

// Mock Redis
vi.mock("../utils/redis", () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
  RATE_LIMIT_PREFIX: "rl:",
}));

describe("TwilioNotifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isConfigured", () => {
    it("returns true when all required Twilio credentials are set", () => {
      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
      });

      expect(notifier.isConfigured()).toBe(true);
    });

    it("returns false when accountSid is missing", () => {
      const notifier = new TwilioNotifier({
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
      });

      expect(notifier.isConfigured()).toBe(false);
    });

    it("returns false when authToken is missing", () => {
      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
      });

      expect(notifier.isConfigured()).toBe(false);
    });

    it("returns false when fromNumber is missing", () => {
      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        toNumber: "+0987654321",
      });

      expect(notifier.isConfigured()).toBe(false);
    });

    it("returns false when toNumber is missing", () => {
      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
      });

      expect(notifier.isConfigured()).toBe(false);
    });
  });

  describe("isEnabled", () => {
    it("returns true for low_balance when configured", () => {
      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
      });

      expect(notifier.isEnabled("low_balance")).toBe(true);
    });

    it("returns false for low_balance when not configured", () => {
      const notifier = new TwilioNotifier({});

      expect(notifier.isEnabled("low_balance")).toBe(false);
    });
  });

  describe("notifyLowBalance", () => {
    beforeEach(() => {
      vi.mocked(redisModule.default.incr).mockResolvedValue(1 as never);
      vi.mocked(redisModule.default.expire).mockResolvedValue(1 as never);
      vi.mocked(redisModule.default.ttl).mockResolvedValue(14400 as never);
    });

    it("skips notification when balance is above critical threshold", async () => {
      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
        criticalThresholdXlm: 10,
      });

      const result = await notifier.notifyLowBalance({
        accountPublicKey: "GCRITICALBALANCE",
        balanceXlm: 15,
        thresholdXlm: 20,
        criticalThresholdXlm: 10,
      });

      expect(result).toBe(false);
      expect(redisModule.default.incr).not.toHaveBeenCalled();
    });

    it("sends SMS when balance is at or below critical threshold", async () => {
      // Mock Twilio client
      mockTwilioCreate.mockResolvedValue({
        sid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        status: "queued",
      });

      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
        criticalThresholdXlm: 10,
      });

      const result = await notifier.notifyLowBalance({
        accountPublicKey: "GCRITICALBALANCE",
        balanceXlm: 9.5,
        thresholdXlm: 20,
        criticalThresholdXlm: 10,
      });

      expect(result).toBe(true);
      expect(mockTwilioCreate).toHaveBeenCalledWith({
        from: "+1234567890",
        to: "+0987654321",
        body: expect.stringContaining("Critical Low Balance"),
      });
    });

    it("respects rate limiting: blocks second SMS within 4 hours", async () => {
      vi.mocked(redisModule.default.incr)
        .mockResolvedValueOnce(1 as never)
        .mockResolvedValueOnce(2 as never);
      vi.mocked(redisModule.default.ttl)
        .mockResolvedValueOnce(14400 as never)
        .mockResolvedValueOnce(14000 as never);

      mockTwilioCreate.mockResolvedValue({
        sid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        status: "queued",
      });

      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
      });

      // First SMS should succeed
      const result1 = await notifier.notifyLowBalance({
        accountPublicKey: "GCRITICALBALANCE",
        balanceXlm: 5,
        thresholdXlm: 20,
      });
      expect(result1).toBe(true);
      expect(mockTwilioCreate).toHaveBeenCalledTimes(1);

      // Second SMS should be rate-limited
      const result2 = await notifier.notifyLowBalance({
        accountPublicKey: "GCRITICALBALANCE",
        balanceXlm: 4,
        thresholdXlm: 20,
      });
      expect(result2).toBe(false);
      expect(mockTwilioCreate).toHaveBeenCalledTimes(1); // Still just 1
    });

    it("logs SMS message in test mode without actually sending", async () => {
      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
        testMode: true,
      });

      const result = await notifier.notifyLowBalance({
        accountPublicKey: "GTESTMODE",
        balanceXlm: 5,
        thresholdXlm: 20,
      });

      expect(result).toBe(true);
      // In test mode, SMS should not actually be sent via Twilio
      expect(mockTwilioCreate).not.toHaveBeenCalled();
    });

    it("handles Redis failure gracefully by allowing SMS", async () => {
      vi.mocked(redisModule.default.incr).mockRejectedValue(
        new Error("Redis connection failed"),
      );

      mockTwilioCreate.mockResolvedValue({
        sid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        status: "queued",
      });

      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
      });

      const result = await notifier.notifyLowBalance({
        accountPublicKey: "GREDISFAIL",
        balanceXlm: 5,
        thresholdXlm: 20,
      });

      // Should allow SMS to proceed when Redis fails (fail open)
      expect(result).toBe(true);
      expect(mockTwilioCreate).toHaveBeenCalled();
    });

    it("returns false when Twilio is not configured", async () => {
      const notifier = new TwilioNotifier({}); // No credentials

      const result = await notifier.notifyLowBalance({
        accountPublicKey: "GNOTCONFIGURED",
        balanceXlm: 5,
        thresholdXlm: 20,
      });

      expect(result).toBe(false);
    });

    it("includes account public key and balance in SMS message", async () => {
      mockTwilioCreate.mockResolvedValue({
        sid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        status: "queued",
      });

      const notifier = new TwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
      });

      await notifier.notifyLowBalance({
        accountPublicKey: "GABC123DEFG456",
        balanceXlm: 5.42,
        thresholdXlm: 20,
      });

      const callArgs = mockTwilioCreate.mock.calls[0][0];
      expect(callArgs.body).toMatch(/Account:.*ABC123D.*DEFG456/);
      expect(callArgs.body).toContain("5.42");
    });
  });

  describe("Factory function", () => {
    it("createTwilioNotifier returns a TwilioNotifier instance", () => {
      const notifier = createTwilioNotifier({
        accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        authToken: "auth_token_here",
        fromNumber: "+1234567890",
        toNumber: "+0987654321",
      });

      expect(notifier).toBeInstanceOf(TwilioNotifier);
      expect(notifier.isConfigured()).toBe(true);
    });
  });
});
