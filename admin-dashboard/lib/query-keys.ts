/**
 * Centralized query key factory.
 *
 * Every useQuery/useMutation call in the dashboard pulls its key from this
 * module so invalidations stay correct and refactors are one-liners. Keys are
 * structured as tuples so `queryClient.invalidateQueries({ queryKey: [...] })`
 * can target a whole scope with partial prefixes.
 *
 * Convention:
 *   all()                 — root invalidation handle for a resource family
 *   list(params)          — list views, keyed by params for cache segmentation
 *   detail(id)            — single-record views
 *   mutationKey(action)   — mutation identifiers, useful for tracking in devtools
 */

export const queryKeys = {
  notifications: {
    all: () => ["notifications"] as const,
    list: () => ["notifications", "list"] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
  },
  feeEstimate: {
    all: () => ["fee-estimate"] as const,
    compute: (params: FeeEstimateParams) =>
      ["fee-estimate", "compute", params] as const,
  },
  signers: {
    all: () => ["signers"] as const,
    list: () => ["signers", "list"] as const,
    detail: (publicKey: string) => ["signers", "detail", publicKey] as const,
  },
  apiKeys: {
    all: () => ["api-keys"] as const,
    list: () => ["api-keys", "list"] as const,
  },
  webhooks: {
    all: () => ["webhooks"] as const,
    list: () => ["webhooks", "list"] as const,
    deliveryLogs: (webhookId?: string) =>
      ["webhooks", "delivery-logs", webhookId ?? "all"] as const,
    dlq: () => ["webhooks", "dlq"] as const,
  },
  sandbox: {
    all: () => ["sandbox"] as const,
    telemetry: () => ["sandbox", "telemetry"] as const,
  },
  chains: {
    all: () => ["chains"] as const,
    list: () => ["chains", "list"] as const,
  },
  sar: {
    all: () => ["sar"] as const,
    queue: (status?: string) => ["sar", "queue", status ?? "all"] as const,
  },
} as const;

export interface FeeEstimateParams {
  assetCode: string;
  amount: string;
  urgent?: boolean;
}
