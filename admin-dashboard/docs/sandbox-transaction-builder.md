# Sandbox Transaction Builder Interface

**Issue:** #741  
**Package:** `admin-dashboard`

## Overview

The Sandbox Transaction Builder is a form-based UI in the admin sandbox workspace (`/admin/sandbox`) that lets admins manually construct, validate, and test Stellar transaction envelopes without needing an external tool.

## Components

| File | Purpose |
|---|---|
| `lib/sandbox-transaction-builder.ts` | Pure validation and XDR-build logic |
| `lib/sandbox-transaction-builder.test.ts` | Unit + edge-case tests |
| `components/dashboard/SandboxTransactionBuilder.tsx` | React form component |
| `app/admin/sandbox/page.tsx` | Mounts the builder below the existing `SandboxPanel` |

## Supported Operations

- **Payment** – transfer XLM or any asset between two accounts
- **Create Account** – fund a new Stellar account
- **Manage Data** – attach arbitrary key/value data to an account

## Validation Rules

| Field | Rule |
|---|---|
| Source / Destination | Must match `G[A-Z2-7]{55}` (Stellar public key) |
| Amount | Positive number; skipped for `manage_data` |
| Fee | ≥ 100 stroops |
| Network Passphrase | Non-empty string |

Errors are shown inline per field only after the user has interacted with that field (touched state), preventing premature error display.

## Usage

1. Navigate to **Admin → Sandbox**.
2. Select an operation type.
3. Fill in the required fields.
4. Click **Build Transaction** — the XDR envelope appears below.
5. Copy the XDR and submit it to `/fee-bump` or paste it into Stellar Laboratory.

## Running Tests

```bash
cd admin-dashboard
pnpm exec vitest run lib/sandbox-transaction-builder.test.ts
```
