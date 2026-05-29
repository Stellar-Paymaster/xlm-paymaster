/**
 * Session timeout warning utilities.
 *
 * The NextAuth.js session has a maxAge of 8 hours (auth.ts).
 * This module tracks the time remaining and fires callbacks so the UI can
 * warn admins before their session expires and offer a one-click renewal.
 */

export interface SessionTimeoutOptions {
  /** Total session duration in seconds (mirrors NextAuth maxAge). Default: 8 h */
  sessionMaxAgeSec?: number;
  /** How many seconds before expiry to fire the warning callback. Default: 5 min */
  warningThresholdSec?: number;
  /** How many seconds before expiry to fire the critical callback. Default: 60 s */
  criticalThresholdSec?: number;
  /** Called when the session enters the warning window. */
  onWarning?: (secondsLeft: number) => void;
  /** Called when the session enters the critical window. */
  onCritical?: (secondsLeft: number) => void;
  /** Called when the session has expired. */
  onExpired?: () => void;
  /** Tick interval in milliseconds. Default: 10 000 (10 s) */
  tickIntervalMs?: number;
}

export interface SessionTimeoutState {
  secondsLeft: number;
  phase: "active" | "warning" | "critical" | "expired";
}

export const SESSION_MAX_AGE_SEC = 8 * 60 * 60; // 8 hours
export const WARNING_THRESHOLD_SEC = 5 * 60;     // 5 minutes
export const CRITICAL_THRESHOLD_SEC = 60;         // 1 minute
export const TICK_INTERVAL_MS = 10_000;           // 10 seconds

export function getPhase(
  secondsLeft: number,
  warningThreshold: number,
  criticalThreshold: number,
): SessionTimeoutState["phase"] {
  if (secondsLeft <= 0) return "expired";
  if (secondsLeft <= criticalThreshold) return "critical";
  if (secondsLeft <= warningThreshold) return "warning";
  return "active";
}

export function formatTimeLeft(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export class SessionTimeoutMonitor {
  private readonly sessionMaxAgeSec: number;
  private readonly warningThresholdSec: number;
  private readonly criticalThresholdSec: number;
  private readonly tickIntervalMs: number;
  private readonly onWarning?: (secondsLeft: number) => void;
  private readonly onCritical?: (secondsLeft: number) => void;
  private readonly onExpired?: () => void;

  private startedAt: number = Date.now();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastPhase: SessionTimeoutState["phase"] = "active";

  constructor(opts: SessionTimeoutOptions = {}) {
    this.sessionMaxAgeSec = opts.sessionMaxAgeSec ?? SESSION_MAX_AGE_SEC;
    this.warningThresholdSec = opts.warningThresholdSec ?? WARNING_THRESHOLD_SEC;
    this.criticalThresholdSec = opts.criticalThresholdSec ?? CRITICAL_THRESHOLD_SEC;
    this.tickIntervalMs = opts.tickIntervalMs ?? TICK_INTERVAL_MS;
    this.onWarning = opts.onWarning;
    this.onCritical = opts.onCritical;
    this.onExpired = opts.onExpired;
  }

  /** Start monitoring from now (or from an explicit session-issued-at epoch). */
  start(issuedAtMs?: number): void {
    this.startedAt = issuedAtMs ?? Date.now();
    this.lastPhase = this.getState().phase;
    this.stop();
    this.timerId = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /** Reset the session start time (e.g. after the user extends their session). */
  reset(issuedAtMs?: number): void {
    this.startedAt = issuedAtMs ?? Date.now();
    this.lastPhase = "active";
  }

  getState(): SessionTimeoutState {
    const elapsedSec = Math.floor((Date.now() - this.startedAt) / 1000);
    const secondsLeft = Math.max(0, this.sessionMaxAgeSec - elapsedSec);
    const phase = getPhase(secondsLeft, this.warningThresholdSec, this.criticalThresholdSec);
    return { secondsLeft, phase };
  }

  private tick(): void {
    const { secondsLeft, phase } = this.getState();

    if (phase !== this.lastPhase) {
      if (phase === "warning") this.onWarning?.(secondsLeft);
      if (phase === "critical") this.onCritical?.(secondsLeft);
      if (phase === "expired") {
        this.stop();
        this.onExpired?.();
      }
      this.lastPhase = phase;
    }
  }
}
