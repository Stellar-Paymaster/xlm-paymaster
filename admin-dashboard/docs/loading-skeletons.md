# Loading Skeletons (Layout-Shift Elimination)

**Status:** Implemented — `components/ui/skeleton.tsx`, `components/skeletons/*`, `app/admin/*/loading.tsx`
**Scope:** `admin-dashboard/` only
**Goal:** Eliminate Cumulative Layout Shift (CLS) during data fetching across every admin route.

## 1. Problem

Admin routes are Next.js server components (`app/admin/dashboard/page.tsx`, `app/admin/transactions/page.tsx`, …). Each awaits several async fetchers before any HTML streams. Until resolution, the browser shows the *previous* route — and when the new page arrives, headers, stat tiles, charts, and tables pop in at once. That is exactly the CLS failure mode the task targets.

## 2. Design

Two layers plus a drop-in Next.js hook.

### 2.1 `<Skeleton>` primitive

`components/ui/skeleton.tsx` — dimensionless placeholder. Consumers supply size via className (`h-*`, `w-*`, `rounded-*`). Keeping the dimensional decision with the caller lets composite skeletons match the real component's geometry byte-for-byte, which is what actually kills layout shift.

- `role="status"` + `aria-busy="true"` + `aria-live="polite"` so screen readers announce the load state.
- `motion-safe:animate-pulse` — disabled automatically when `prefers-reduced-motion` is set.
- Forward-ref compatible for composition.

### 2.2 Composite skeletons — one per dashboard shape

All live in `components/skeletons/`:

| Composite            | Mirrors                                                      | Used by                                   |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| `StatCardSkeleton`   | `components/dashboard/StatCard.tsx`                          | `DashboardSkeleton`                       |
| `TableSkeleton`      | `TransactionsTable`, `SignersTable`, `AdminUsersTable`, …    | `DashboardSkeleton`, `AdminPageSkeleton`, `app/admin/transactions/loading.tsx` |
| `ChartSkeleton`      | `SpendChart`, `ExpenseBreakdown`                             | `DashboardSkeleton`                       |
| `DashboardSkeleton`  | full `/admin/dashboard` page                                 | `app/admin/dashboard/loading.tsx`         |
| `AdminPageSkeleton`  | generic header + toolbar + table admin pages                 | every other `/admin/*/loading.tsx`        |

Each composite preserves border-radius (`rounded-3xl`), padding (`p-6`), grid template, and child-stack rhythm of the real component. That is why a swap-in does not push a single pixel.

### 2.3 Next.js `loading.tsx` integration

Every `/admin/*/page.tsx` that awaits data has a sibling `loading.tsx` that renders the appropriate composite skeleton. Next.js renders `loading.tsx` **instantly** while the server component awaits, so the browser never sees the dead-time blank that causes CLS.

Routes wired:

```
app/admin/dashboard/loading.tsx
app/admin/transactions/loading.tsx
app/admin/signers/loading.tsx
app/admin/users/loading.tsx
app/admin/api-keys/loading.tsx
app/admin/audit-logs/loading.tsx
app/admin/webhooks/loading.tsx
app/admin/sar/loading.tsx
app/admin/chains/loading.tsx
app/admin/cosmos-feegrant/loading.tsx
app/admin/bridge-settlements/loading.tsx
app/admin/cross-chain-sync/loading.tsx
app/admin/sandbox/loading.tsx
app/login/loading.tsx           (replaced old spinner)
```

The integration test in `components/skeletons/skeletons.integration.test.ts` **asserts every `page.tsx` has a sibling `loading.tsx`** and that each `loading.tsx` imports from `@/components/skeletons`, so future routes cannot silently regress.

## 3. Adding skeletons to a new route

1. Add `app/admin/<route>/loading.tsx` with 3 lines:
   ```tsx
   import { AdminPageSkeleton } from "@/components/skeletons";
   export default function Loading() {
     return <AdminPageSkeleton rows={8} columns={5} tableLabel="Loading ..." />;
   }
   ```
2. For anything more elaborate (charts, multi-section pages), compose directly from `StatCardSkeleton`, `TableSkeleton`, `ChartSkeleton`, or assemble fresh skeletons beside them.
3. Run `npm test` in `admin-dashboard/` — the integration guardrails will catch a missing `loading.tsx`.

## 4. Accessibility contract

Every skeleton component (composite or primitive) must be announceable. The integration test enforces this: either the component uses the `<Skeleton>` primitive (which sets `role="status"` + `aria-busy`), or it declares those attributes itself.

- `aria-live="polite"` prevents the load state from rudely interrupting a screen-reader's current utterance.
- `sr-only` `label` prop on `<Skeleton>` gives assistive tech a meaningful substring ("Loading transactions") rather than silence.
- `motion-safe:animate-pulse` defers to the user's `prefers-reduced-motion` setting.

## 5. Performance and memory

- **Zero client-side JS** for any loading.tsx — they render purely on the server.
- **Cheap DOM** — `TableSkeleton` caps at `MAX_TABLE_ROWS=50` × `MAX_TABLE_COLUMNS=12`; total cells (including header row) stay under 650 even at maxed-out configuration. Unit-tested as `totalTableSkeletonCells stays under the render budget at the documented caps`.
- **Pure-function sizing logic** — `clampTableRows`, `clampTableColumns`, `clampLegendRows`, `clampToolbars` are defined in `components/skeletons/skeleton-utils.ts` and tested in isolation (14 unit tests) to guarantee out-of-range or adversarial values can never reach the render path.

## 6. Edge cases covered by tests

| #  | Case                                                              | Test                                                                                  |
| -- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1  | Undefined input falls back to sane default                        | `clampCount returns the fallback for undefined input`                                 |
| 2  | NaN / Infinity never reach render                                 | `clampCount returns the fallback for NaN and +/-Infinity`                             |
| 3  | Fractional inputs are truncated                                   | `clampCount truncates fractional input`                                               |
| 4  | Below-min → pinned to min                                         | `clampCount pins values below the minimum to the minimum`                             |
| 5  | Above-max → pinned to max                                         | `clampCount pins values above the maximum to the maximum`                             |
| 6  | In-range integers preserved                                       | `clampCount preserves in-range integer input`                                         |
| 7  | Table row bounds                                                  | `clampTableRows enforces MIN_TABLE_ROWS / MAX_TABLE_ROWS`                             |
| 8  | Table column bounds                                               | `clampTableColumns enforces MIN_TABLE_COLUMNS / MAX_TABLE_COLUMNS`                    |
| 9  | Legend row bounds (zero allowed)                                  | `clampLegendRows allows zero (no legend) and caps at MAX_LEGEND_ROWS`                 |
| 10 | Toolbar row bounds (zero allowed)                                 | `clampToolbars allows zero and caps at MAX_TOOLBARS`                                  |
| 11 | Grid template syntax                                              | `gridStyleForColumns emits an equal-fraction repeat template`                         |
| 12 | Grid template clamps oversized/invalid columns                    | `gridStyleForColumns clamps oversized and invalid column counts`                      |
| 13 | Total cell-count scales correctly                                 | `totalTableSkeletonCells multiplies clamped rows by clamped columns`                  |
| 14 | Cell-count stays under render budget at caps                      | `totalTableSkeletonCells stays under the render budget at the documented caps`        |
| 15 | Barrel re-exports every public skeleton                           | `components/skeletons/index.ts re-exports every public skeleton`                      |
| 16 | Named `export function` per component                             | `every public skeleton is declared as an exported function in its source`             |
| 17 | Accessibility contract — role/aria-busy                           | `every public skeleton emits role="status" and aria-busy for assistive tech`          |
| 18 | Every admin `page.tsx` has a `loading.tsx`                        | `loading.tsx exists for every data-fetching admin route`                              |
| 19 | Every `loading.tsx` pulls from the shared barrel                  | `every /admin/*/loading.tsx renders a skeleton from the shared barrel`                |

## 7. Verification

See `admin-dashboard/verification/loading-skeletons.md` for captured terminal output.
