import { beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "./circuitBreaker";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("starts in Closed state", () => {
    const cb = new CircuitBreaker({ label: "test" });
    expect(cb.getState()).toBe("Closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("stays Closed below the failure threshold", () => {
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 4; i++) {
      cb.recordFailure();
    }

    expect(cb.getState()).toBe("Closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("transitions to Open after reaching failure threshold within window", () => {
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }

    expect(cb.getState()).toBe("Open");
    expect(cb.allowRequest()).toBe(false);
  });

  it("rejects requests when Open", () => {
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 5; i++) cb.recordFailure();

    expect(cb.allowRequest()).toBe(false);
    expect(cb.allowRequest()).toBe(false);
  });

  it("transitions to Half-Open after recovery timeout elapses", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 5; i++) cb.recordFailure();
    expect(cb.getState()).toBe("Open");

    vi.advanceTimersByTime(10_001);
    expect(cb.getState()).toBe("Half-Open");
  });

  it("allows exactly one probe in Half-Open state", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 5; i++) cb.recordFailure();
    vi.advanceTimersByTime(10_001);

    expect(cb.allowRequest()).toBe(true);   // probe allowed
    expect(cb.allowRequest()).toBe(false);  // second caller blocked
  });

  it("transitions to Closed on successful probe in Half-Open state", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 5; i++) cb.recordFailure();
    vi.advanceTimersByTime(10_001);
    cb.allowRequest();  // trigger half-open probe slot
    cb.recordSuccess();

    expect(cb.getState()).toBe("Closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("re-opens on failed probe in Half-Open state", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 5; i++) cb.recordFailure();
    vi.advanceTimersByTime(10_001);
    cb.allowRequest();  // trigger half-open probe slot
    cb.recordFailure();

    expect(cb.getState()).toBe("Open");
    expect(cb.allowRequest()).toBe(false);
  });

  it("resets failure count to zero on success in Closed state", () => {
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 4; i++) cb.recordFailure();
    cb.recordSuccess();

    const status = cb.getStatus();
    expect(status.state).toBe("Closed");
    expect(status.failureCount).toBe(0);
  });

  it("ignores failures outside the sliding window", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    // Record 4 failures then advance past the window
    for (let i = 0; i < 4; i++) cb.recordFailure();
    vi.advanceTimersByTime(30_001);

    // One more failure — old ones are pruned, so total within window is 1
    cb.recordFailure();
    expect(cb.getState()).toBe("Closed");
  });

  it("getStatus returns timestamps when open", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ label: "test", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 5; i++) cb.recordFailure();

    const status = cb.getStatus();
    expect(status.state).toBe("Open");
    expect(status.openedAt).toBeDefined();
    expect(status.nextRetryAt).toBeDefined();
    expect(status.lastFailureAt).toBeDefined();
  });

  it("opens after exactly 5 failures within 30 seconds (acceptance criterion)", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ label: "horizon-endpoint", failureThreshold: 5, windowMs: 30_000, recoveryTimeoutMs: 10_000 });

    for (let i = 0; i < 5; i++) {
      expect(cb.getState()).toBe("Closed");
      cb.recordFailure();
    }

    expect(cb.getState()).toBe("Open");
  });
});
