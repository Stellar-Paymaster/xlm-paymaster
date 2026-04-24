# Efficient Data Fetching — TanStack Query

**Status:** Implemented — `providers/QueryProvider.tsx`, `providers/queryConfig.ts`, `lib/query-keys.ts`, `hooks/useNotifications.ts`
**Scope:** `admin-dashboard/` only
**Goal:** Replace ad-hoc `fetch` calls with a centralized TanStack Query client so caching, retries, and network-recovery refetching are uniform across every dashboard surface.

## 1. Problem

Thirty-plus client components called `fetch()` directly. Every one made its own ad-hoc decision about caching (most had none), retries (most had none), re-fetch on reconnect (none), and error handling (mostly swallowed). The result: flickering UIs on network drop, duplicate in-flight requests from sibling components, and no way to invalidate a cached resource centrally after a mutation.

## 2. Design

### 2.1 Centralized configuration — `providers/queryConfig.ts`

A single `QUERY_DEFAULTS` object declares every knob. Bumping a value here propagates to every hook in the app — that's the whole point of centralising.

| Knob                    | Value       | Purpose                                                                          |
| ----------------------- | ----------- | -------------------------------------------------------------------------------- |
| `staleTime`             | 30 000 ms   | Freshness window for stale-while-revalidate                                      |
| `gcTime`                | 300 000 ms  | How long evicted data lingers in memory before GC                                |
| `retry`                 | 2           | Max retries for transient failures                                               |
| `retryDelayBaseMs`      | 500 ms      | Exponential backoff base                                                         |
| `retryDelayCapMs`       | 30 000 ms   | Hard cap on retry delay                                                          |
| `refetchOnReconnect`    | **true**    | Acceptance-criterion #2 — automatic re-fetching on network recovery              |
| `refetchOnWindowFocus`  | **true**    | Cross-tab consistency — newly focused tabs see fresh data                        |
| `refetchOnMount`        | **true**    | Initial fetch when a component first subscribes                                  |

`shouldRetry(failureCount, error)` encodes the retry policy. 4xx client errors are not retried — the caller cannot fix them by asking again. 5xx server errors and non-HTTP/transport errors are retried up to the cap.

`retryDelay(attempt)` returns `min(base * 2^attempt, cap)` — clamped exponential backoff.

`createQueryClient()` is the factory; `providers/QueryProvider.tsx` wraps it in a `QueryClientProvider`. The factory is pure so the configuration is unit-testable without mounting React.

### 2.2 Provider wiring — `components/providers.tsx`

```tsx
<QueryProvider>
  <SessionProvider>
    {children}
    <AiSupportWidget />
  </SessionProvider>
</QueryProvider>
```

Placed at the outermost layer so every client component in the tree has access to the shared cache.

### 2.3 Centralized query-key factory — `lib/query-keys.ts`

Every `useQuery`/`useMutation` call pulls its key from this module. Keys are tuples prefixed by the resource family so partial invalidation works:

```ts
queryKeys.notifications.all()           // ["notifications"]            — root handle
queryKeys.notifications.list()          // ["notifications", "list"]   — specific view
queryKeys.webhooks.deliveryLogs("w_1")  // ["webhooks", "delivery-logs", "w_1"]
```

Invalidating `queryKeys.notifications.all()` nukes every cached notification query. Invalidating `.list()` targets just that slice.

### 2.4 Migrated hook — `hooks/useNotifications.ts`

Representative migration — the dashboard's notification bell:

- `useNotificationsQuery()` — replaces the old `fetch("/api/notifications")` + `useState` + `useEffect` + `loading` triple-dance with a single `useQuery`. Gains: stale-while-revalidate, retry, reconnect refetch, window-focus refetch, dedup across sibling subscribers.
- `useMarkNotificationReadMutation()` — optimistic update + rollback on error + invalidate-on-settle.
- `useMarkAllNotificationsReadMutation()` — same pattern for the bulk action.

URL builders (`notificationsListUrl`, `markNotificationReadUrl`, `markAllNotificationsReadUrl`) are exported as pure helpers so the URL construction is testable in isolation.

### 2.5 Refactored consumer — `components/dashboard/NotificationBell.tsx`

Before: 40+ lines of `useState`/`useCallback`/`useEffect` juggling for initial fetch, SSE push integration, and read mutations.

After: three hook calls. The SSE listener (which pushes notifications outside of the HTTP request/response cycle) now patches the React Query cache directly via `queryClient.setQueryData` — the SSE-driven notification list and the HTTP-driven baseline stay in the same place.

## 3. Migrating a new component

1. Add a key factory to `lib/query-keys.ts` if the resource family doesn't have one.
2. Write a hook in `hooks/<feature>.ts`:
   ```ts
   export function useFooQuery() {
     return useQuery({
       queryKey: queryKeys.foo.list(),
       queryFn: async ({ signal }) => {
         const res = await fetch(fooListUrl(), { signal });
         if (!res.ok) throw new HttpError(res.status, `...`);
         return res.json();
       },
     });
   }
   ```
3. Swap the component's `useState`/`useEffect`/`fetch` triad for `const { data, isLoading } = useFooQuery();`.
4. For mutations, use `useMutation` with the optimistic-update pattern demonstrated in `useNotifications.ts`.

## 4. Acceptance criteria — evidence

| Criterion                                         | Where                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Centralized query configuration                   | `providers/queryConfig.ts`, `QUERY_DEFAULTS` object                |
| Automatic re-fetching on network recovery         | `QUERY_DEFAULTS.refetchOnReconnect = true`; locked down by test    |
| `src/providers/QueryProvider.tsx` deliverable     | `providers/QueryProvider.tsx` (the repo uses root-level `providers/`, not `src/providers/`, per convention) |
| Refactored components/hooks                       | `hooks/useNotifications.ts`, `components/dashboard/NotificationBell.tsx` |

## 5. Edge cases covered by tests (27 total)

| #  | Case                                                          | Test                                                                                 |
| -- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1  | Config documents stale-while-revalidate contract              | `QUERY_DEFAULTS documents a stale-while-revalidate contract`                         |
| 2  | Refetch-on-reconnect is ON                                    | `QUERY_DEFAULTS turns on automatic refetch on reconnect (acceptance criterion)`      |
| 3  | Refetch-on-focus is ON                                        | `QUERY_DEFAULTS turns on refetch on window focus for cross-tab consistency`          |
| 4  | Retry stops after cap                                         | `shouldRetry returns false after QUERY_DEFAULTS.retry attempts`                      |
| 5  | Retry continues on generic errors                             | `shouldRetry keeps trying on generic errors below the retry cap`                     |
| 6  | Retry skips 4xx                                               | `shouldRetry stops retrying on 4xx client errors — the caller can't fix them`        |
| 7  | Retry continues on 5xx                                        | `shouldRetry continues on 5xx server errors and network/transport errors`            |
| 8  | Retry handles non-HTTP errors                                 | `shouldRetry continues on non-HTTP errors (no status field)`                         |
| 9  | Backoff is exponential                                        | `retryDelay grows exponentially with each attempt`                                   |
| 10 | Backoff is capped                                             | `retryDelay is capped at QUERY_DEFAULTS.retryDelayCapMs`                             |
| 11 | Backoff handles edge attempts                                 | `retryDelay handles zero and negative attempts gracefully`                           |
| 12 | `createQueryClient` wires QUERY_DEFAULTS into the client      | `createQueryClient returns a QueryClient whose default options match QUERY_DEFAULTS` |
| 13 | Factory produces independent instances                        | `createQueryClient produces independent instances (no cross-test contamination)`     |
| 14 | `isHttpError` narrows only on numeric status                  | `isHttpError narrows only to objects with a numeric 'status'`                        |
| 15 | Every resource family has an `all()` handle                   | `every resource family exposes an all key for bulk invalidation`                     |
| 16 | Sub-keys share the family root for partial invalidation       | `sub-keys are prefixed by the family root so partial invalidation works`             |
| 17 | Equal inputs → equal keys (cache hits)                        | `keys are value-stable for equal inputs so React Query caches hit`                   |
| 18 | Different inputs → different keys (no false hits)             | `different inputs produce different keys — no false cache hits`                      |
| 19 | Default webhook scope for missing id                          | `deliveryLogs without a webhookId uses the sentinel 'all' scope`                     |
| 20 | Default SAR scope for missing status                          | `sar queue without a status uses the sentinel 'all' scope`                           |
| 21 | Keys are plain arrays (structural equality works)             | `keys are plain arrays (React Query treats them structurally)`                       |
| 22 | URL builder constant                                          | `notificationsListUrl points at the canonical endpoint`                              |
| 23 | URL builder escapes unsafe id characters                      | `markNotificationReadUrl encodes the id so unsafe characters can't break the URL`    |
| 24 | URL builder rejects empty ids before the network              | `markNotificationReadUrl rejects empty ids before they hit the network`              |
| 25 | Bulk URL is a constant                                        | `markAllNotificationsReadUrl is a fixed endpoint`                                    |
| 26 | HttpError preserves status for retry classification           | `HttpError preserves the status code for retry classification`                       |
| 27 | HttpError is an `instanceof Error`                            | `HttpError can be caught as a standard Error (interop with third-party handlers)`    |

## 6. Performance notes

- **Request deduplication** — multiple components mounting `useNotificationsQuery` share one in-flight fetch and one cached result.
- **Stale-while-revalidate** — navigating back to the dashboard within 30 s serves cached data instantly while a background refetch runs.
- **No polling by default** — the hook relies on SSE for push updates (lower bandwidth than polling) and reconnect/focus for recovery.
- **Optimistic updates** — mark-read feels instant; the server confirms silently.
- **Bounded retries** — a dead endpoint stops being hit after 2 attempts with 0.5 s / 1 s backoff; it won't become a background DDoS.
