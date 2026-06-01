/**
 * SMTP and Slack Stateful Alert Notification System
 * Fluid Resilience & Cooldown Module | Issue #156
 * 
 * Provides stateful balance drop alerts with a configurable 6-hour cooldown window
 * to prevent alert flooding.
 * 
 * Catastrophic Bypass Rule:
 *  - If the wallet balance drops by 50% or more since the last alerted balance,
 *    the cooldown is bypassed and a CRITICAL alert is immediately fired.
 */

export interface AlertConfig {
  cooldownWindowMs: number; // default: 21,600,000 (6 hours)
  lowBalanceThreshold: number; // default: 10 XLM
  slackWebhookUrl?: string;
  smtpHost?: string;
}

export interface AlertPayload {
  address: string;
  balance: number;
  currency?: string;
  lastAlertedBalance?: number;
}

export class AlertSystem {
  private config: AlertConfig;
  
  // Stateful stores mapping `${channel}:${address}` -> timestamp/balance
  private lastAlertTimes = new Map<string, number>();
  private lastAlertBalances = new Map<string, number>();

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = {
      cooldownWindowMs: config.cooldownWindowMs ?? 6 * 60 * 60 * 1000, // 6 hours
      lowBalanceThreshold: config.lowBalanceThreshold ?? 10.0,
      slackWebhookUrl: config.slackWebhookUrl,
      smtpHost: config.smtpHost,
    };
  }

  /**
   * Reset the stateful cooldown tracking. Useful for tests.
   */
  public reset(): void {
    this.lastAlertTimes.clear();
    this.lastAlertBalances.clear();
  }

  /**
   * Updates configuration dynamically
   */
  public updateConfig(newConfig: Partial<AlertConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };
  }

  /**
   * Check if a channel's alert is currently in a cooldown state for a specific address.
   */
  public getCooldownStatus(channel: "slack" | "smtp", address: string): { active: boolean; remainingMs: number } {
    const key = `${channel}:${address}`;
    const lastTime = this.lastAlertTimes.get(key);
    if (!lastTime) {
      return { active: false, remainingMs: 0 };
    }
    
    const elapsed = Date.now() - lastTime;
    const remaining = this.config.cooldownWindowMs - elapsed;
    return {
      active: remaining > 0,
      remainingMs: Math.max(0, remaining),
    };
  }

  /**
   * Fired when a balance drop is detected.
   * Enforces 6-hour stateful cooldowns, but overrides them if a severe drop occurs.
   * @returns boolean indicating if the alert was successfully sent (true) or deduplicated (false).
   */
  public async processBalanceAlert(
    channel: "slack" | "smtp",
    payload: AlertPayload
  ): Promise<boolean> {
    const { address, balance, currency = "XLM" } = payload;

    // Validate inputs
    if (!address || address.trim() === "") {
      console.warn(`[AlertSystem] Aborting alert: Invalid wallet address`);
      return false;
    }

    if (balance < 0) {
      console.warn(`[AlertSystem] Warning: Negative balance ${balance} detected for ${address}`);
    }

    // Only alert if balance is under low balance threshold
    if (balance >= this.config.lowBalanceThreshold) {
      return false;
    }

    const key = `${channel}:${address}`;
    const now = Date.now();
    const lastTime = this.lastAlertTimes.get(key);
    const lastBalance = this.lastAlertBalances.get(key);

    let isCooldownActive = false;
    if (lastTime) {
      isCooldownActive = now - lastTime < this.config.cooldownWindowMs;
    }

    // Deduplication check with Critical Bypass:
    // If the balance has dropped by >= 50% of the last alerted balance, we bypass the cooldown!
    let isCriticalBypass = false;
    if (isCooldownActive && lastBalance !== undefined) {
      const dropRatio = (lastBalance - balance) / lastBalance;
      if (dropRatio >= 0.50) {
        isCriticalBypass = true;
      }
    }

    if (isCooldownActive && !isCriticalBypass) {
      console.log(`[AlertSystem] ${channel.toUpperCase()} alert suppressed under 6h cooldown for address: ${address}`);
      return false;
    }

    // Trigger sending the alert (Mock API / Logging)
    try {
      if (channel === "slack") {
        await this.dispatchSlackAlert(address, balance, currency, isCriticalBypass);
      } else {
        await this.dispatchSmtpAlert(address, balance, currency, isCriticalBypass);
      }

      // Update stateful cooldown tracking
      this.lastAlertTimes.set(key, now);
      this.lastAlertBalances.set(key, balance);
      return true;
    } catch (err) {
      console.error(`[AlertSystem] Failed to dispatch ${channel} alert:`, err);
      // Ensure we don't crash, return false
      return false;
    }
  }

  private async dispatchSlackAlert(
    address: string,
    balance: number,
    currency: string,
    isCritical: boolean
  ): Promise<void> {
    const severity = isCritical ? "🚨 CRITICAL DROP" : "⚠️ WARNING";
    console.log(`[AlertSystem] DISPATCHING SLACK: [${severity}] Wallet ${address} balance is ${balance} ${currency}`);
    
    // Simulate Slack Webhook call
    if (this.config.slackWebhookUrl) {
      // In production, this would make an actual axios/fetch POST call
    }
  }

  private async dispatchSmtpAlert(
    address: string,
    balance: number,
    currency: string,
    isCritical: boolean
  ): Promise<void> {
    const severity = isCritical ? "CRITICAL BALANCE DROP" : "Low Balance Warning";
    console.log(`[AlertSystem] DISPATCHING SMTP: [${severity}] Wallet ${address} balance is ${balance} ${currency}`);

    // Simulate SMTP dispatch
    if (this.config.smtpHost) {
      // In production, this would use nodemailer to deliver the SMTP message
    }
  }
}
