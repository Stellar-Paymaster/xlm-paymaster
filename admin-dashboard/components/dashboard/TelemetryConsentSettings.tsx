"use client";

/**
 * Telemetry consent toggle for the admin dashboard.
 * Stub implementation to support E2E and local dev when telemetry backend is unavailable.
 */
export function TelemetryConsentSettings() {
  return (
    <section
      aria-label="Telemetry consent settings"
      className="rounded-3xl border border-border/50 bg-card p-6 shadow-sm"
    >
      <h2 className="text-base font-semibold text-foreground">Telemetry</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Anonymous usage telemetry helps improve Paymaster. You can opt out at any time.
      </p>
    </section>
  );
}
