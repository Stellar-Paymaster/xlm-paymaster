"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  SessionTimeoutMonitor,
  formatTimeLeft,
  type SessionTimeoutState,
} from "@/lib/session-timeout";

const WARNING_THRESHOLD_SEC = 5 * 60;  // Show banner at 5 minutes
const CRITICAL_THRESHOLD_SEC = 60;     // Show modal at 1 minute
const TICK_INTERVAL_MS = 10_000;       // Poll every 10 seconds

export function SessionTimeoutWarning() {
  const { data: session, status, update } = useSession();
  const [state, setState] = useState<SessionTimeoutState>({
    secondsLeft: Infinity,
    phase: "active",
  });
  const [dismissed, setDismissed] = useState(false);
  const [extending, setExtending] = useState(false);
  const monitorRef = useRef<SessionTimeoutMonitor | null>(null);

  const handleExtend = useCallback(async () => {
    setExtending(true);
    try {
      await update();
      monitorRef.current?.reset();
      setState({ secondsLeft: Infinity, phase: "active" });
      setDismissed(false);
    } finally {
      setExtending(false);
    }
  }, [update]);

  const handleSignOut = useCallback(() => {
    signOut({ callbackUrl: "/login" });
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    const monitor = new SessionTimeoutMonitor({
      sessionMaxAgeSec: 8 * 60 * 60,
      warningThresholdSec: WARNING_THRESHOLD_SEC,
      criticalThresholdSec: CRITICAL_THRESHOLD_SEC,
      tickIntervalMs: TICK_INTERVAL_MS,
      onWarning: (secondsLeft) => {
        setState({ secondsLeft, phase: "warning" });
        setDismissed(false);
      },
      onCritical: (secondsLeft) => {
        setState({ secondsLeft, phase: "critical" });
        setDismissed(false);
      },
      onExpired: () => {
        setState({ secondsLeft: 0, phase: "expired" });
        signOut({ callbackUrl: "/login" });
      },
    });

    monitorRef.current = monitor;
    monitor.start();

    // Also tick immediately so the state reflects reality on mount
    const syncState = () => setState(monitor.getState());
    const syncId = setInterval(syncState, TICK_INTERVAL_MS);

    return () => {
      monitor.stop();
      clearInterval(syncId);
      monitorRef.current = null;
    };
  }, [status, session]);

  // Nothing to show when the session is healthy or dismissed
  if (state.phase === "active" || status !== "authenticated") return null;
  if (dismissed && state.phase === "warning") return null;

  const timeLabel = formatTimeLeft(state.secondsLeft);
  const isCritical = state.phase === "critical" || state.phase === "expired";

  return (
    <>
      {/* Warning banner — shown at 5 minutes */}
      {state.phase === "warning" && (
        <div
          role="alert"
          aria-live="polite"
          data-testid="session-warning-banner"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 w-full max-w-md px-4"
        >
          <div className="flex items-center justify-between gap-4 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 shadow-lg text-sm text-yellow-800 dark:border-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-200">
            <div>
              <span className="font-semibold">Session expiring soon — </span>
              {timeLabel} remaining
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExtend}
                disabled={extending}
                className="rounded-md border border-yellow-400 bg-yellow-100 px-3 py-1 text-xs font-semibold transition hover:bg-yellow-200 disabled:opacity-50 dark:bg-yellow-800 dark:hover:bg-yellow-700"
              >
                {extending ? "Extending…" : "Stay logged in"}
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setDismissed(true)}
                className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-300"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Critical modal — shown at 1 minute */}
      {isCritical && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="session-timeout-title"
          aria-describedby="session-timeout-desc"
          data-testid="session-critical-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <span aria-hidden className="text-2xl">⏱</span>
            </div>
            <h2
              id="session-timeout-title"
              className="text-lg font-bold text-foreground"
            >
              Session expiring
            </h2>
            <p
              id="session-timeout-desc"
              className="mt-2 text-sm text-muted-foreground"
            >
              Your admin session will expire in{" "}
              <span
                className="font-bold text-destructive tabular-nums"
                data-testid="session-countdown"
              >
                {timeLabel}
              </span>
              . Extend your session to keep working without losing unsaved changes.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleExtend}
                disabled={extending}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {extending ? "Extending…" : "Extend session"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
