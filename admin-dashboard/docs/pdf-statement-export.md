# PDF Statement Export

## Overview

The billing dashboard now includes a monthly PDF statement export flow for finance teams. The export is generated inside `admin-dashboard` from the same billing payload used by `/admin/billing`, so the statement reflects the operator-facing dashboard state without exposing raw invoice URLs or admin tokens.

## What Ships

- `lib/pdf-statement-export.ts`
  - Builds month-aware statement models from billing history
  - Calculates finance summary metrics for successful, pending, and failed activity
  - Generates branded PDF statements through `jspdf` and `jspdf-autotable`
- `components/dashboard/BillingStatementExport.tsx`
  - Provides month selection and export controls
  - Surfaces zero-activity months cleanly
  - Shows summary telemetry before export
- `app/admin/billing/page.tsx`
  - Integrates the statement export panel into the billing workflow

## Design and Security Notes

- Statement month selection is constrained to valid billing months, with a current-month fallback for empty ledgers.
- Invalid dates are ignored during month aggregation so malformed rows do not break export.
- Missing invoice URLs are represented as `Not attached` rather than rendering raw URLs in the PDF.
- Sample environments are explicitly marked in both the UI and exported statement to reduce reporting mistakes.
- Amount and quota calculations clamp invalid numeric input to avoid NaN output in exported documents.

## Test Coverage

- Unit: statement month derivation, summary calculations, filename/date formatting, PDF export wrapper behavior
- Integration: billing export panel rendering, month switching, export invocation, zero-activity and failure states
