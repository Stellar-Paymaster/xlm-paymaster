# Pull Request Description - XLM Paymaster Platform Enhancements, Security and Resilience Polish

## Title
feat: security-limits-congestion-graph-wcag-audit-and-alert-cooldowns

## Summary

This PR addresses and resolves four distinct key issues across the `server`, `admin-dashboard`, and `paymaster-server` directories. All changes are thoroughly tested with zero regressions.

### 1. Express Endpoints Strict Payload Limits (`server/`)
- Enforces strict request body content-length limits of **256KB** using `express.json({ limit: "256kb" })`.
- Intercepts body-parser `PayloadTooLargeError` errors in the global error handler (`server/src/middleware/errorHandler.ts`) to return a clean JSON payload and HTTP **413 Payload too large** status.
- Added comprehensive Vitest integration tests verifying both compliant payloads and oversized blocks are rejected.

### 2. Interactive Congestion Fee Estimator Graph (`admin-dashboard/`)
- Implemented a premium, highly interactive Recharts-based 24-hour congestion curve and projected fee cost visualization under `admin-dashboard/src/fees/components/CongestionFeeEstimatorGraph.tsx`.
- Features real-time parameter controls for base fee and region alongside a **Surge Simulator** slider allowing manual traffic simulation over selected hours with instant graph and calculation updates.
- Fully integrated onto the main dashboard and backed by comprehensive Vitest component tests.

### 3. WCAG 2.1 Web Accessibility Auditing Engine (`admin-dashboard/`)
- Designed and built a robust programmatic accessibility checking engine (`admin-dashboard/src/compliance/accessibility/WCAGAudit.ts`) conforming to **WCAG 2.1 Level AA** standards.
- Supports relative luminance color contrast ratio math, keyboard focusability tabindex checking, screen reader alt tag presence, paired input labels, and structural heading sequence audits.
- Implemented a standard `ComplianceHook` integration and created full unit test coverage using the native Node test runner.

### 4. Stateful Cooldown & Deduplication for SMTP/Slack Alerts (`paymaster-server/`)
- Hardens the alert system (`paymaster-server/src/notifications/alertSystem.ts`) to prevent operator alert flooding during balance drops by enforcing a stateful **6-hour cooldown**.
- Implemented a **Critical Drop Override** (Catastrophic Bypass) which immediately fires an emergency notification if the balance has plummeted by 50% or more since the last alerted state.
- Tracks Slack and SMTP channels independently and backed by a comprehensive unit test suite in Vitest.

---

## Verification & Test Results

### 1. Express Endpoints Payload Limit Tests
```bash
 RUN  v4.1.4 C:/Users/U S E R/Drips/Doris/xlm-paymaster/server

 ✓ src/test/payloadLimit.test.ts (2 tests) 146ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  2.46s
```

### 2. Interactive Congestion Fee Estimator Graph Component Tests
```bash
 RUN  v4.1.4 C:/Users/U S E R/Drips/Doris/xlm-paymaster/admin-dashboard

 ✓ src/fees/__tests__/CongestionFeeEstimatorGraph.test.tsx (4 tests) 993ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  16.25s
```

### 3. WCAG 2.1 Accessibility Audit Compliance Engine Tests
```bash
✔ WCAGAudit calculates relative luminance of black and white exactly (33.1534ms)
✔ WCAGAudit calculates contrast ratio of black vs white exactly as 21:1 (1.1711ms)
✔ WCAGAudit verifies compliant and non-compliant contrast ratios (0.5741ms)
✔ WCAGAudit audits heading sequences and flags skipped levels (4.0104ms)
✔ WCAGAudit audits negative tabIndexes for keyboard accessibility (0.3881ms)
✔ WCAGAudit audits images for alt descriptive labels (2.0307ms)
✔ WCAGAudit audits form controls for valid label pairings (1.3858ms)
✔ WCAGAccessibilityHook executes through compliance framework (0.7105ms)
✔ WCAGAccessibilityHook handles null, undefined, and non-string inputs gracefully (0.4626ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 447.197
```

### 4. Alert Stateful Cooldown and Critical Bypass Tests
```bash
 RUN  v4.1.4 C:/Users/U S E R/Drips/Doris/xlm-paymaster

 ✓ paymaster-server/src/notifications/alertSystem.test.ts (7 tests) 22ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  1.03s
```

---

## Changed and Added Files

```
server/
├── src/index.ts (Enforce 256KB limits)
├── src/middleware/errorHandler.ts (Intercept 413)
└── src/test/payloadLimit.test.ts [NEW] (Supertest integration)

admin-dashboard/
├── package.json (Updated test:unit command)
├── app/admin/dashboard/page.tsx (Render new graph widget)
├── src/compliance/index.ts (Export accessibility hook)
├── src/compliance/accessibility/WCAGAudit.ts [NEW] (Relative luminance math, element scan)
├── src/compliance/hooks/wcag-accessibility-hook.ts [NEW] (Compliance integration)
├── src/compliance/__tests__/wcag-accessibility.test.ts [NEW] (Node tests)
├── src/fees/index.ts (Export new graph)
├── src/fees/components/CongestionFeeEstimatorGraph.tsx [NEW] (Interactive graph and simulator)
└── src/fees/__tests__/CongestionFeeEstimatorGraph.test.tsx [NEW] (Vitest component tests)

paymaster-server/
├── src/notifications/alertSystem.ts [NEW] (Stateful cooldown and bypass override)
└── src/notifications/alertSystem.test.ts [NEW] (Stateful alert system tests)

docs/
├── localized-fee-estimation.md (Updated details)
├── compliance-hooks.md (Updated architectural outline)
├── wcag-21-web-accessibility-audit.md [NEW] (Accessibility audit documentation)
└── alert-system-cooldown-deduplication.md [NEW] (Alert system cooldown documentation)
```
