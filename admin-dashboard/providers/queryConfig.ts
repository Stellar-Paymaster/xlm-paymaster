/**
 * Pure, DOM-free configuration for the shared QueryClient. Lives in a `.ts`
 * file (no JSX) so it can be unit-tested without a TSX compiler — the React
 * provider in QueryProvider.tsx just imports from here.
 */

import { QueryClient } from "@tanstack/react-query";

export const QUERY_DEFAULTS = {
  /** Data is considered fresh for this many ms; stale data triggers a background refetch on the next access. */
  staleTime: 30_000,
  /** Keep evicted query data in memory for this many ms before garbage-collecting. */
  gcTime: 5 * 60_000,
  /** Number of retries on transient errors. 4xx client errors are NOT retried — see `shouldRetry`. */
  retry: 2,
  /** Exponential back-off base in ms. Actual delay = base * 2 ** attempt, capped at retryDelayCapMs. */
  retryDelayBaseMs: 500,
  retryDelayCapMs: 30_000,
  /** Refetch automatically when the browser regains network connectivity. */
  refetchOnReconnect: true,
  /** Refetch when the window regains focus. */
  refetchOnWindowFocus: true,
  /** Run an initial fetch whenever a component first subscribes. */
  refetchOnMount: true,
} as const;

export interface HttpErrorLike {
  status: number;
}

export function isHttpError(value: unknown): value is HttpErrorLike {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { status?: unknown };
  return typeof candidate.status === "number";
}

/**
 * Returns true when the given error should trigger another retry attempt.
 * 4xx client errors stop immediately — retrying won't make them fixable.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= QUERY_DEFAULTS.retry) return false;

  if (isHttpError(error)) {
    return error.status < 400 || error.status >= 500;
  }

  return true;
}

/**
 * Computes the delay before the next retry attempt — exponential backoff,
 * capped at QUERY_DEFAULTS.retryDelayCapMs.
 */
export function retryDelay(attempt: number): number {
  const exponential =
    QUERY_DEFAULTS.retryDelayBaseMs * Math.pow(2, Math.max(0, attempt));
  return Math.min(exponential, QUERY_DEFAULTS.retryDelayCapMs);
}

/**
 * Factory for the shared QueryClient. Pure — tests can call this and assert
 * the produced configuration without mounting React.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_DEFAULTS.staleTime,
        gcTime: QUERY_DEFAULTS.gcTime,
        retry: shouldRetry,
        retryDelay,
        refetchOnReconnect: QUERY_DEFAULTS.refetchOnReconnect,
        refetchOnWindowFocus: QUERY_DEFAULTS.refetchOnWindowFocus,
        refetchOnMount: QUERY_DEFAULTS.refetchOnMount,
      },
      mutations: {
        retry: 1,
        retryDelay,
      },
    },
  });
}
