# Stateful Alert Cooldown & Deduplication

## Overview

The `AlertSystem` module protects operators and operations channels (such as Slack and SMTP) from **alert flooding** during balance drops. By default, it imposes a state-based **6-hour cooldown window** on notifications for any given wallet address, while preserving safety via an emergency **catastrophic drop override** (e.g. drop of >=50% since last alert).

---

## Architectural Mechanisms

### 1. Stateful Cooldown (Deduplication)
When a wallet balance drops below the threshold, the system checks the timestamp of the last dispatched alert for the given `(channel, address)` key:
- If `now - lastTime < cooldownWindowMs` (6 hours by default), the warning notification is **suppressed/deduplicated**.
- If no prior alert was sent, or the cooldown has expired, the alert is sent, and the timestamp is updated.
- **Independent Channels**: Cooldown states are tracked independently for Slack and SMTP so that both channels receive the initial notification correctly.

### 2. Catastrophic Drop Override (Bypass)
To prevent critical, fast-moving wallet depletions from being ignored due to a recent warning alert, the system compares the current balance against the `lastAlertedBalance`:
- If the balance has dropped by **50% or more** of the last alerted value (e.g. 10.0 XLM down to 4.5 XLM), the 6-hour cooldown is **bypassed immediately**.
- A **CRITICAL DROP** alert is dispatched on the channel to warn operations teams of high-priority drainage.

---

## Technical Configuration

The alert system supports dynamic updates and custom configurations:

```typescript
export interface AlertConfig {
  cooldownWindowMs: number;     // Cooldown duration (default: 21,600,000 ms / 6 hours)
  lowBalanceThreshold: number;  // Threshold for alerting in XLM (default: 10.0)
  slackWebhookUrl?: string;     // Slack integration endpoint
  smtpHost?: string;            // SMTP delivery host
}
```

---

## API & Usage

### Initialize the Alert System
```typescript
import { AlertSystem } from "./alertSystem";

const alertSystem = new AlertSystem({
  cooldownWindowMs: 6 * 60 * 60 * 1000, // 6 Hours
  lowBalanceThreshold: 10.0,            // Alert under 10 XLM
});
```

### Process Balance Updates
Call `processBalanceAlert` on every balance check event:

```typescript
const alertDispatched = await alertSystem.processBalanceAlert("slack", {
  address: "GCF5JWV2...PDVDZNMX",
  balance: 4.0, // Fails threshold check
});

if (alertDispatched) {
  console.log("Slack alert dispatched successfully.");
} else {
  console.log("Alert suppressed under cooldown or already dispatched.");
}
```
