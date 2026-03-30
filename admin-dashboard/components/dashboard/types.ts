export type DashboardSignerStatus =
  | "Active"
  | "Low Balance"
  | "Sequence Error"
  | "Inactive";

export interface DashboardTransaction {
  id: string;
  hash: string;
  amount: string;
  asset: string;
  category: string;
  status: "pending" | "submitted" | "success" | "failed";
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSigner {
  id: string;
  publicKey: string;
  status: DashboardSignerStatus;
  balance: string;
  inFlight: number;
  totalUses: number;
  sequenceNumber: string;
}

export type TransactionStatus = "pending" | "submitted" | "success" | "failed";

export interface TransactionHistoryRow {
  id: string;
  timestamp: string;
  innerHash: string;
  category: string;
  status: TransactionStatus;
  costStroops: number;
  tenant: string;
}

export interface SpendForecastData {
  alert: boolean;
  averageDailySpendXlm: number;
  currentBalanceXlm: number;
  historicalBalance: Array<{ date: string; balanceXlm: number }>;
  projectedBalance: Array<{ date: string; balanceXlm: number }>;
  runwayDays: number | null;
  runwayMessage: string;
  source: "live" | "sample";
  spendSeries: Array<{ date: string; spendXlm: number }>;
}

export interface FeeMultiplierData {
  congestionLevel: "low" | "high";
  multiplier: number;
  reason: string;
  source: "live" | "sample";
  updatedAt: string;
}

export interface TenantUsageRow {
  tenant: string;
  txCount: number;
  totalCostStroops: number;
  successCount: number;
  failedCount: number;
}

export type ChainId = "stellar" | "evm" | "solana" | "cosmos";

export interface ApiKey {
  id: string;
  key: string;
  prefix: string;
  tenantId: string;
  active: boolean;
  allowedChains: ChainId[];
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionTierCode = "free" | "pro" | "enterprise";

export interface SubscriptionTier {
  id: string;
  name: "Free" | "Pro" | "Enterprise";
  code: SubscriptionTierCode;
  txLimit: number;
  rateLimit: number;
  priceMonthly: number;
}

export interface TenantTierSummary {
  id: string;
  name: string;
  subscriptionTierId: string;
  subscriptionTier: SubscriptionTier;
}

export interface SubscriptionTierPageData {
  tiers: SubscriptionTier[];
  tenants: TenantTierSummary[];
  tenant: TenantTierSummary | null;
  source: "live" | "sample";
}

export type WebhookEventType = "tx.success" | "tx.failed" | "balance.low";

export interface WebhookTenantSettings {
  tenantId: string;
  tenantName: string | null;
  webhookUrl: string | null;
  eventTypes: WebhookEventType[];
  updatedAt: string | null;
}

export interface WebhookDlqItem {
  id: string;
  tenantId: string;
  tenantName: string;
  deliveryId: string;
  url: string;
  payload: string;
  lastError: string | null;
  retryCount: number;
  failedAt: string;
  expiresAt: string;
}

export type WebhookDeliveryStatus =
  | "success"
  | "failed"
  | "pending"
  | "retrying";

export type WebhookDeliverySort =
  | "time_desc"
  | "time_asc"
  | "status_asc"
  | "status_desc"
  | "attempts_desc"
  | "attempts_asc";

export interface WebhookDeliveryLog {
  id: string;
  tenantId: string;
  tenantName: string | null;
  eventType: WebhookEventType;
  webhookUrl: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  responseCode: number | null;
  responseMessage: string | null;
  payload: {
    event: WebhookEventType;
    data: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
  nextRetryAt: string | null;
}

export interface WebhookDeliveryQuery {
  page: number;
  pageSize: number;
  search: string;
  sort: WebhookDeliverySort;
  statusFilter: WebhookDeliveryStatus[];
  eventTypeFilter: WebhookEventType[];
  tenantFilter: string[];
}

export interface WebhookDeliveryPageData extends WebhookDeliveryQuery {
  rows: WebhookDeliveryLog[];
  totalRows: number;
  totalPages: number;
  source: "live" | "sample";
}

export type TransactionHistorySort =
  | "time_desc"
  | "time_asc"
  | "cost_desc"
  | "cost_asc";

export interface TransactionHistoryQuery {
  page: number;
  pageSize: number;
  search: string;
  sort: TransactionHistorySort;
}

export interface TransactionHistoryPageData {
  rows: TransactionHistoryRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  sort: TransactionHistorySort;
  search: string;
  source: "live" | "sample";
}

export type PartnerStatus = "pending" | "approved" | "rejected";

export interface Partner {
  id: string;
  projectName: string;
  contactEmail: string;
  websiteUrl: string;
  description: string;
  status: PartnerStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface PartnerPageData {
  partners: Partner[];
  source: "live" | "sample";
}
