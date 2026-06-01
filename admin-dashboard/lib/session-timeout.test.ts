import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getPhase,
  formatTimeLeft,
  SessionTimeoutMonitor,
  WARNING_THRESHOLD_SEC,
  CRITICAL_THRESHOLD_SEC,
  SESSION_MAX_AGE_SEC,
} from "./session-timeout";

// ─── getPhase ─────────────────────────────────────────────────────────────────

describe("getPhase", () => {
  const warn = WARNING_THRESHOLD_SEC;   // 300 s
  const crit = CRITICAL_THRESHOLD_SEC;  // 60 s

  it("returns 'active' when seconds remaining exceed the warning threshold", () => {
    expect(getPhase(warn + 1, warn, crit)).toBe("active");
    expect(getPhase(SESSION_MAX_AGE_SEC, warn, crit)).toBe("active");
  });

  it("returns 'warning' when at or below the warning threshold", () => {
    expect(getPhase(warn, warn, crit)).toBe("warning");
    expect(getPhase(warn - 1, warn, crit)).toBe("warning");
    expect(getPhase(crit + 1, warn, crit)).toBe("warning");
  });

  it("returns 'critical' when at or below the critical threshold", () => {
    expect(getPhase(crit, warn, crit)).toBe("critical");
    expect(getPhase(crit - 1, warn, crit)).toBe("critical");
    expect(getPhase(1, warn, crit)).toBe("critical");
  });

  it("returns 'expired' when seconds are 0 or negative", () => {
    expect(getPhase(0, warn, crit)).toBe("expired");
    expect(getPhase(-10, warn, crit)).toBe("expired");
  });
});

// ─── formatTimeLeft ───────────────────────────────────────────────────────────

describe("formatTimeLeft", () => {
  it("formats whole minutes", () => {
    expect(formatTimeLeft(300)).toBe("5:00");
    expect(formatTimeLeft(60)).toBe("1:00");
  });

  it("zero-pads seconds", () => {
    expect(formatTimeLeft(65)).toBe("1:05");
    expect(formatTimeLeft(9)).toBe("0:09");
  });

  it("returns '0:00' for zero or negative input", () => {
    expect(formatTimeLeft(0)).toBe("0:00");
    expect(formatTimeLeft(-5)).toBe("0:00");
  });

  it("handles large values", () => {
    expect(formatTimeLeft(SESSION_MAX_AGE_SEC)).toBe("480:00");
  });
});

// ─── SessionTimeoutMonitor ────────────────────────────────────────────────────

describe("SessionTimeoutMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports 'active' phase immediately after start", () => {
    const monitor = new SessionTimeoutMonitor({
      sessionMaxAgeSec: 3600,
      warningThresholdSec: 300,
      criticalThresholdSec: 60,
    });
    monitor.start();
    const { phase, secondsLeft } = monitor.getState();
    expect(phase).toBe("active");
    expect(secondsLeft).toBe(3600);
    monitor.stop();
  });

  it("fires onWarning when the session enters the warning window", () => {
    const onWarning = vi.fn();
    const sessionMaxAgeSec = 310;

    const monitor = new SessionTimeoutMonitor({
      sessionMaxAgeSec,
      warningThresholdSec: 300,
      criticalThresholdSec: 60,
      tickIntervalMs: 1000,
      onWarning,
    });
    monitor.start(Date.now());

    // Advance time so ~11 s of the session have passed (310 - 11 = 299 s left → warning)
    vi.advanceTimersByTime(11_000);
    expect(onWarning).toHaveBeenCalledOnce();
    expect(onWarning.mock.calls[0][0]).toBeLessThanOrEqual(300);
    monitor.stop();
  });

  it("fires onCritical when the session enters the critical window", () => {
    const onCritical = vi.fn();
    const sessionMaxAgeSec = 65;

    const monitor = new SessionTimeoutMonitor({
      sessionMaxAgeSec,
      warningThresholdSec: 300,
      criticalThresholdSec: 60,
      tickIntervalMs: 1000,
      onCritical,
    });
    monitor.start(Date.now());

    // 6 s elapsed → 59 s left → critical
    vi.advanceTimersByTime(6_000);
    expect(onCritical).toHaveBeenCalledOnce();
    monitor.stop();
  });

  it("fires onExpired when the session runs out and stops the timer", () => {
    const onExpired = vi.fn();
    const sessionMaxAgeSec = 5;

    const monitor = new SessionTimeoutMonitor({
      sessionMaxAgeSec,
      warningThresholdSec: 300,
      criticalThresholdSec: 60,
      tickIntervalMs: 1000,
      onExpired,
    });
    monitor.start(Date.now());

    vi.advanceTimersByTime(6_000);
    expect(onExpired).toHaveBeenCalledOnce();

    // Should not fire again after expiry
    vi.advanceTimersByTime(5_000);
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("does not fire callbacks more than once per phase transition", () => {
    const onWarning = vi.fn();
    const sessionMaxAgeSec = 310;

    const monitor = new SessionTimeoutMonitor({
      sessionMaxAgeSec,
      warningThresholdSec: 300,
      criticalThresholdSec: 60,
      tickIntervalMs: 1000,
      onWarning,
    });
    monitor.start(Date.now());

    // Advance through the warning window multiple times
    vi.advanceTimersByTime(30_000);
    expect(onWarning).toHaveBeenCalledOnce();
    monitor.stop();
  });

  it("resets the monitor and returns to active phase", () => {
    const onWarning = vi.fn();
    const sessionMaxAgeSec = 310;

    const monitor = new SessionTimeoutMonitor({
      sessionMaxAgeSec,
      warningThresholdSec: 300,
      criticalThresholdSec: 60,
      tickIntervalMs: 1000,
      onWarning,
    });
    monitor.start(Date.now());

    vi.advanceTimersByTime(11_000);
    expect(onWarning).toHaveBeenCalledOnce();

    // User extends session — reset
    monitor.reset();
    expect(monitor.getState().phase).toBe("active");

    // Warning should fire again after reset
    vi.advanceTimersByTime(11_000);
    expect(onWarning).toHaveBeenCalledTimes(2);
    monitor.stop();
  });

  it("getState returns correct secondsLeft at a given elapsed time", () => {
    const monitor = new SessionTimeoutMonitor({ sessionMaxAgeSec: 1000 });
    const issuedAt = Date.now();
    monitor.start(issuedAt);

    vi.advanceTimersByTime(100_000);

    const { secondsLeft } = monitor.getState();
    expect(secondsLeft).toBe(900);
    monitor.stop();
  });
});
