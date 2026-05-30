import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "circuit_breaker" });

export type CircuitBreakerState = "Closed" | "Open" | "Half-Open";

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt?: string;
  openedAt?: string;
  nextRetryAt?: string;
}

export interface CircuitBreakerConfig {
  /** Number of failures within the window to trip the breaker. Default: 5 */
  failureThreshold: number;
  /** Sliding window duration in ms. Default: 30_000 */
  windowMs: number;
  /** How long to stay Open before transitioning to Half-Open. Default: 10_000 */
  recoveryTimeoutMs: number;
  /** Label used in log messages. */
  label: string;
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, "label"> = {
  failureThreshold: 5,
  windowMs: 30_000,
  recoveryTimeoutMs: 10_000,
};

/**
 * A three-state circuit breaker.
 *
 * - Closed  → requests pass through normally.
 * - Open    → requests are fast-failed immediately.
 * - Half-Open → one probe request is allowed; success → Closed, failure → Open.
 *
 * The breaker trips Open after `failureThreshold` failures recorded within the
 * `windowMs` sliding window.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = "Closed";
  private failureTimestamps: number[] = [];
  private openedAt: number = 0;
  private halfOpenProbeInFlight = false;
  private readonly cfg: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> & { label: string }) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  get label (): string {
    return this.cfg.label;
  }

  getState (): CircuitBreakerState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  getStatus (): CircuitBreakerStatus {
    this.maybeTransitionToHalfOpen();
    const failures = this.countRecentFailures();
    const status: CircuitBreakerStatus = {
      state: this.state,
      failureCount: failures,
    };

    if (this.failureTimestamps.length > 0) {
      status.lastFailureAt = new Date(
        this.failureTimestamps[this.failureTimestamps.length - 1]
      ).toISOString();
    }

    if (this.state === "Open" || this.state === "Half-Open") {
      status.openedAt = new Date(this.openedAt).toISOString();
      if (this.state === "Open") {
        status.nextRetryAt = new Date(
          this.openedAt + this.cfg.recoveryTimeoutMs
        ).toISOString();
      }
    }

    return status;
  }

  /**
   * Returns true when the caller may proceed with the request.
   * Returns false when the circuit is Open and the request should be fast-failed.
   * In Half-Open state, only the first concurrent caller gets true.
   */
  allowRequest (): boolean {
    this.maybeTransitionToHalfOpen();

    if (this.state === "Closed") return true;

    if (this.state === "Half-Open") {
      if (this.halfOpenProbeInFlight) return false;
      this.halfOpenProbeInFlight = true;
      return true;
    }

    // Open
    return false;
  }

  recordSuccess (): void {
    if (this.state === "Half-Open") {
      logger.info({ label: this.cfg.label }, "Circuit breaker closed after successful probe");
      this.halfOpenProbeInFlight = false;
    }

    this.state = "Closed";
    this.failureTimestamps = [];
    this.openedAt = 0;
  }

  recordFailure (): void {
    const now = Date.now();
    this.failureTimestamps.push(now);
    this.pruneOldFailures(now);

    if (this.state === "Half-Open") {
      // Re-open the circuit immediately
      this.halfOpenProbeInFlight = false;
      this.openedAt = now;
      this.state = "Open";
      logger.warn(
        { label: this.cfg.label },
        "Circuit breaker re-opened after failed half-open probe"
      );
      return;
    }

    if (this.state === "Closed" && this.countRecentFailures() >= this.cfg.failureThreshold) {
      this.state = "Open";
      this.openedAt = now;
      logger.warn(
        {
          label: this.cfg.label,
          failure_count: this.countRecentFailures(),
          window_ms: this.cfg.windowMs,
          threshold: this.cfg.failureThreshold,
        },
        "Circuit breaker opened"
      );
    }
  }

  private maybeTransitionToHalfOpen (): void {
    if (
      this.state === "Open" &&
      Date.now() >= this.openedAt + this.cfg.recoveryTimeoutMs
    ) {
      this.state = "Half-Open";
      this.halfOpenProbeInFlight = false;
      logger.info(
        { label: this.cfg.label, recovery_timeout_ms: this.cfg.recoveryTimeoutMs },
        "Circuit breaker transitioned to half-open"
      );
    }
  }

  private pruneOldFailures (now: number): void {
    const cutoff = now - this.cfg.windowMs;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);
  }

  private countRecentFailures (): number {
    this.pruneOldFailures(Date.now());
    return this.failureTimestamps.length;
  }
}
