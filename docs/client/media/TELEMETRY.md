# Anonymous Usage Telemetry & Diagnostics

The Fluid SDK includes an optional, anonymous telemetry and diagnostics system to help maintainers understand SDK usage patterns and improve the library.

## Overview

The telemetry system is designed with privacy as a core principle:

- **Opt-in by default**: Telemetry and diagnostics are disabled unless explicitly enabled
- **Anonymous**: No personal data, transaction data, or wallet addresses are collected without explicit context
- **Non-intrusive**: Fire-and-forget design that never blocks SDK functionality
- **Daily deduplication**: Only one telemetry ping per day to minimize network overhead

## Telemetry vs. Diagnostics

| Feature | Purpose | Frequency | Opt-in Flag |
|---------|---------|-----------|-------------|
| **Telemetry** | General usage stats (SDK version, domain) | Once per day | `enableTelemetry` |
| **Diagnostics** | Bug reports and error context | When an error occurs | `enableDiagnostics` |

---

## 1. Anonymous Telemetry

When telemetry is enabled, the SDK sends a single daily ping with the following data:

```json
{
  "sdk_version": "0.1.1",
  "domain": "example.com",
  "timestamp": "2026-03-27"
}
```

### How to Enable Telemetry

```typescript
const client = new FluidClient({
  networkPassphrase: "...",
  enableTelemetry: true, // Enable anonymous telemetry
});
```

---

## 2. Diagnostics (Bug Reporting)

When diagnostics are enabled, developers can manually report bugs or errors directly from the SDK. This helps us identify and fix issues faster.

### How to Enable Diagnostics

```typescript
const client = new FluidClient({
  networkPassphrase: "...",
  enableDiagnostics: true, // Enable diagnostics reporting
});
```

### Reporting a Bug

```typescript
try {
  await client.requestFeeBump(tx);
} catch (error) {
  client.reportBug("Fee-bump failed unexpectedly", { 
    error: error.message,
    txHash: tx.hash() 
  });
}
```

### Data Collected in Diagnostics

Diagnostics reports include the same base data as telemetry, plus:
- `message`: The error message
- `severity`: "info" | "warning" | "error" | "critical"
- `context`: Any additional JSON-serializable data provided by the developer

---

## Custom Endpoints

You can optionally specify custom endpoints for both telemetry and diagnostics:

```typescript
const client = new FluidClient({
  networkPassphrase: "...",
  enableTelemetry: true,
  telemetryEndpoint: "https://your-custom-ping.com",
  enableDiagnostics: true,
  diagnosticsEndpoint: "https://your-custom-report.com",
});
```

## Privacy Guarantees

### Data Minimization

The telemetry system collects only the minimum data necessary to understand SDK usage patterns. Diagnostics only collect data that you explicitly provide.

### Transparency

All telemetry and diagnostics code is open source and can be audited. The exact data sent is documented in this file and in the source code.

## FAQ

### Q: Why is diagnostics opt-in?

A: We believe in complete transparency and control. You decide when and what diagnostic information is shared.

### Q: Does reporting a bug affect performance?

A: No. Like telemetry, `reportBug` is fire-and-forget and runs in the background.

### Q: Can I disable telemetry but keep diagnostics?

A: Yes! Each feature has its own independent opt-in flag (`enableTelemetry` and `enableDiagnostics`).

## License

The telemetry and diagnostics system is part of the Fluid SDK and is licensed under the same terms as the SDK.

