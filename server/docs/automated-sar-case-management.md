# Automated SAR Case Management

**Status:** Implemented
**Scope:** `server/`
**Goal:** Automate Suspicious Activity Report (SAR) case generation and provide robust case lifecycle management for compliance officers.

## 1. Overview

The `SarCaseManager` provides a core service to automatically generate SAR cases when suspicious or high-risk activity is detected. It standardizes case management, enabling compliance officers to efficiently review, update, and track investigations.

## 2. Architecture

The management layer handles the following components:
- **Case Generation:** Exposes `createCase` to spawn new cases linked to specific tenants and transactions. Enforces business rules like valid risk scores (0-100).
- **Status Lifecycle:** A built-in state machine for statuses (`OPEN` -> `UNDER_REVIEW` -> `FILED` | `DISMISSED`) ensuring appropriate workflow progression.
- **Audit Trails:** Append-only logging of officer notes during status updates or standalone additions, preserving a clear timeline of the investigation.

## 3. Implementation Details

- **Testing:** Validated by robust unit tests in `server/src/services/sarCaseManagement.test.ts`, checking all edge cases and transition blocks.

### State Transitions

- Cases initialize as `OPEN`.
- Review assigns them to `UNDER_REVIEW`.
- A final decision moves the case to `FILED` (if a formal SAR is submitted) or `DISMISSED` (if a false positive).
- **Terminal State Guard:** Updates to cases in `FILED` or `DISMISSED` states are immediately blocked, maintaining historical integrity.

## 4. Usage Example

```typescript
import { SarCaseManager, SarCaseStatus } from "./services/sarCaseManagement";

const manager = new SarCaseManager();

// System flags a high-risk entity automatically
const newCase = manager.createCase("tenant-123", ["tx-554"], 92, "Velocity anomaly detected");

// Officer begins the review process
manager.updateCaseStatus(newCase.id, SarCaseStatus.UNDER_REVIEW, "Initiated enhanced due diligence.");
```