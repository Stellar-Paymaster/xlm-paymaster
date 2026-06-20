import Twilio from "twilio";
import { createLogger } from "../utils/logger";
import redis, { RATE_LIMIT_PREFIX } from "../utils/redis";

const logger = createLogger({ component: "twilio_notifier" });

const SMS_RATE_LIMIT_PREFIX = `${RATE_LIMIT_PREFIX}sms:`;
const SMS_RATE_LIMIT_WINDOW_SECONDS = 4 * 60 * 60; // 4 hours

export interface LowBalanceSmsPayload {
  accountPublicKey: string;
  balanceXlm: number;
  thresholdXlm: number;
  criticalThresholdXlm?: number;
}

export interface TwilioNotifierOptions {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  toNumber?: string;
  criticalThresholdXlm?: number;
  testMode?: boolean;
}

export interface TwilioNotifierLike {
  isConfigured(): boolean;
  isEnabled(type: "low_balance"): boolean;
  notifyLowBalance(payload: LowBalanceSmsPayload): Promise<boolean>;
}

export class TwilioNotifier implements TwilioNotifierLike {
  private readonly accountSid?: string;
  private readonly authToken?: string;
  private readonly fromNumber?: string;
  private readonly toNumber?: string;
  private readonly criticalThresholdXlm?: number;
  private readonly testMode: boolean;
  private readonly client: ReturnType<typeof Twilio> | null = null;

  constructor(options: TwilioNotifierOptions = {}) {
    this.accountSid = options.accountSid;
    this.authToken = options.authToken;
    this.fromNumber = options.fromNumber;
    this.toNumber = options.toNumber;
    this.criticalThresholdXlm = options.criticalThresholdXlm;
    this.testMode = options.testMode ?? false;

    if (this.isConfigured()) {
      try {
        this.client = Twilio(this.accountSid, this.authToken);
      } catch (error) {
        logger.error(
          { error },
          "[TwilioNotifier] Failed to initialize Twilio client",
        );
      }
    }
  }

  isConfigured(): boolean {
    return (
      Boolean(this.accountSid) &&
      Boolean(this.authToken) &&
      Boolean(this.fromNumber) &&
      Boolean(this.toNumber)
    );
  }

  isEnabled(type: "low_balance"): boolean {
    // For now, only low_balance SMS alerts are supported
    if (type !== "low_balance") {
      return false;
    }

    return this.isConfigured();
  }

  async notifyLowBalance(payload: LowBalanceSmsPayload): Promise<boolean> {
    if (!this.isEnabled("low_balance")) {
      return false;
    }

    // If critical threshold is specified, only send SMS if balance is below it
    const criticalThreshold =
      payload.criticalThresholdXlm ?? this.criticalThresholdXlm;
    if (criticalThreshold !== undefined && payload.balanceXlm >= criticalThreshold) {
      logger.debug(
        {
          accountPublicKey: payload.accountPublicKey,
          balanceXlm: payload.balanceXlm,
          criticalThreshold,
        },
        "[TwilioNotifier] Balance above critical threshold, skipping SMS",
      );
      return false;
    }

    try {
      // Check rate limit: max 1 SMS per 4 hours per account
      const rateLimitKey = `${SMS_RATE_LIMIT_PREFIX}${payload.accountPublicKey}`;
      const rateLimitResult = await this.checkAndIncrementRateLimit(
        rateLimitKey,
      );

      if (!rateLimitResult.allowed) {
        logger.info(
          {
            accountPublicKey: payload.accountPublicKey,
            ttl: rateLimitResult.ttl,
          },
          "[TwilioNotifier] SMS rate limit exceeded, skipping notification",
        );
        return false;
      }

      const message = this.buildSmsMessage(payload);

      if (this.testMode) {
        logger.info(
          {
            accountPublicKey: payload.accountPublicKey,
            fromNumber: this.fromNumber,
            toNumber: this.toNumber,
            message,
          },
          "[TwilioNotifier] [TEST MODE] Would send SMS (not actually sending)",
        );
        return true;
      }

      if (!this.client) {
        logger.error(
          "[TwilioNotifier] Twilio client not initialized, cannot send SMS",
        );
        return false;
      }

      if (!this.fromNumber || !this.toNumber) {
        logger.error(
          "[TwilioNotifier] Phone numbers not configured, cannot send SMS",
        );
        return false;
      }

      const result = await this.client.messages.create({
        from: this.fromNumber,
        to: this.toNumber,
        body: message,
      });

      logger.info(
        {
          accountPublicKey: payload.accountPublicKey,
          messageSid: result.sid,
          status: result.status,
        },
        "[TwilioNotifier] SMS sent successfully",
      );

      return true;
    } catch (error) {
      logger.error(
        {
          accountPublicKey: payload.accountPublicKey,
          error: error instanceof Error ? error.message : String(error),
        },
        "[TwilioNotifier] Failed to send SMS",
      );
      return false;
    }
  }

  private buildSmsMessage(payload: LowBalanceSmsPayload): string {
    const lines = [
      "⚠️ Paymaster Alert: Critical Low Balance",
      "",
      `Account: ${payload.accountPublicKey.slice(0, 8)}...${payload.accountPublicKey.slice(-8)}`,
      `Balance: ${payload.balanceXlm.toFixed(2)} XLM`,
      `Threshold: ${payload.thresholdXlm.toFixed(2)} XLM`,
      "",
      "Action required: Top up fee payer account",
    ];

    return lines.join("\n");
  }

  private async checkAndIncrementRateLimit(
    key: string,
  ): Promise<{ allowed: boolean; ttl: number }> {
    try {
      const count = await redis.incr(key);

      if (count === 1) {
        // First increment - set expiry
        await redis.expire(key, SMS_RATE_LIMIT_WINDOW_SECONDS);
      }

      const ttl = await redis.ttl(key);

      // Allow only if this is the first SMS in the window
      return { allowed: count === 1, ttl: Math.max(0, ttl) };
    } catch (error) {
      // If Redis is unavailable, log error but allow SMS to proceed
      // (fail open to avoid missing critical alerts)
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "[TwilioNotifier] Redis rate limit check failed, allowing SMS",
      );
      return { allowed: true, ttl: 0 };
    }
  }
}

// Export a factory function matching the pattern used by other notifiers
export function createTwilioNotifier(
  options: TwilioNotifierOptions = {},
): TwilioNotifier {
  return new TwilioNotifier(options);
}
