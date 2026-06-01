import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AlertSystem } from "./alertSystem";

describe("AlertSystem Stateful Cooldown & Deduplication", () => {
  let alertSystem: AlertSystem;

  beforeEach(() => {
    alertSystem = new AlertSystem({
      cooldownWindowMs: 6000, // 6 seconds for ease of testing
      lowBalanceThreshold: 10.0,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends an initial warning alert when balance drops below threshold", async () => {
    const sent = await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 8.5,
    });
    expect(sent).toBe(true);
  });

  it("suppresses subsequent alerts within the 6-hour cooldown window (deduplication)", async () => {
    // First alert goes through
    await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 8.5,
    });

    // Second alert is suppressed (same address, within cooldown, same balance drop level)
    const secondSent = await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 8.0,
    });
    expect(secondSent).toBe(false);
  });

  it("sends subsequent alert after the cooldown window expires", async () => {
    await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 8.5,
    });

    // Advance time past the 6-hour window (6000ms config)
    vi.advanceTimersByTime(7000);

    const afterExpirySent = await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 7.0,
    });
    expect(afterExpirySent).toBe(true);
  });

  it("bypasses cooldown for CRITICAL balance drops (>=50% drop since last alert)", async () => {
    // First alert at 8.0 XLM
    await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 8.0,
    });

    // Severe drop to 3.5 XLM (a drop of 56.25%, which is >= 50%)
    // Should bypass cooldown and trigger immediately!
    const criticalSent = await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 3.5,
    });
    
    expect(criticalSent).toBe(true);
  });

  it("respects cooldown if drop is under 50% since last alert", async () => {
    // First alert at 8.0 XLM
    await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 8.0,
    });

    // Minor drop to 5.0 XLM (a drop of 37.5%, which is < 50%)
    // Should be suppressed under normal cooldown rules
    const minorSent = await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 5.0,
    });
    
    expect(minorSent).toBe(false);
  });

  it("maintains independent cooldown states for Slack and SMTP channels", async () => {
    // Slack warning alert goes through
    const slackSent = await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: 8.5,
    });
    expect(slackSent).toBe(true);

    // SMTP warning alert for the same address also goes through independently
    const smtpSent = await alertSystem.processBalanceAlert("smtp", {
      address: "GABC123",
      balance: 8.5,
    });
    expect(smtpSent).toBe(true);

    // Both are now in cooldown
    expect(await alertSystem.processBalanceAlert("slack", { address: "GABC123", balance: 8.0 })).toBe(false);
    expect(await alertSystem.processBalanceAlert("smtp", { address: "GABC123", balance: 8.0 })).toBe(false);
  });

  it("gracefully handles invalid address and negative balance edge cases", async () => {
    // Empty address should return false
    const invalidAddressSent = await alertSystem.processBalanceAlert("slack", {
      address: "   ",
      balance: 5.0,
    });
    expect(invalidAddressSent).toBe(false);

    // Negative balance should go through as alert warning
    const negativeBalanceSent = await alertSystem.processBalanceAlert("slack", {
      address: "GABC123",
      balance: -2.0,
    });
    expect(negativeBalanceSent).toBe(true);
  });
});
