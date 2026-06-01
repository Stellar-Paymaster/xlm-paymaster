import "server-only";

export type SARStatus = "pending_review" | "confirmed_suspicious" | "false_positive";

export interface SARReport {
  id: string;
  transactionId: string;
  txHash: string;
  category: string;
  chain: string;
  txCreatedAt: string;
  tenantId: string;
  tenantName: string;
  ruleCode: string;
  reason: string;
  status: SARStatus;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SARStats {
  summary: {
    pending: number;
    confirmed: number;
    falsePositive: number;
    last24Hours: number;
    last7Days: number;
  };
  byRule: Array<{ ruleCode: string; pendingCount: number }>;
}

export interface SARPageData {
  reports: SARReport[];
  total: number;
  stats: SARStats;
  source: "live" | "sample";
}

const SAMPLE_REPORTS: SARReport[] = [
  {
    id: "sample-sar-1",
    transactionId: "sample-tx-1",
    txHash: "e9173ee8b19e004b44ab22d0c1fa4c8029cb6dd4f70b2fdc0e1d897580f48421",
    category: "Token Transfer",
    chain: "stellar",
    txCreatedAt: "2026-03-29T09:38:00.000Z",
    tenantId: "tenant-anchor-west",
    tenantName: "anchor-west",
    ruleCode: "HIGH_FREQUENCY",
    reason: "55 transactions from tenant in 60s window (threshold: 50)",
    status: "pending_review",
    adminNote: null,
    reviewedBy: null,
    reviewedAt: null,
    metadata: { count: 55, windowSeconds: 60, threshold: 50 },
    createdAt: "2026-03-29T09:38:05.000Z",
    updatedAt: "2026-03-29T09:38:05.000Z"
  },
  {
    id: "sample-sar-2",
    transactionId: "sample-tx-3",
    txHash: "54ac50f1d4f33bf3fa0f27c48ceaf7125b1d74c7b3ef97d90df5a8e01db2fc1d",
    category: "Soroban Contract",
    chain: "stellar",
    txCreatedAt: "2026-03-29T09:27:00.000Z",
    tenantId: "tenant-market-maker",
    tenantName: "market-maker",
    ruleCode: "HIGH_SOROBAN_FEE",
    reason: "Soroban transaction fee 150000 stroops exceeds threshold 100000 stroops",
    status: "confirmed_suspicious",
    adminNote: "Unusually large Soroban contract execution",
    reviewedBy: "admin",
    reviewedAt: "2026-03-29T10:00:00.000Z",
    metadata: { costStroops: 150000, category: "Soroban Contract", thresholdStroops: 100000 },
    createdAt: "2026-03-29T09:27:05.000Z",
    updatedAt: "2026-03-29T10:00:00.000Z"
  },
  {
    id: "sample-sar-3",
    transactionId: "sample-tx-5",
    txHash: "8d6ca55f4cdb99eb91f68562202d447dadbef36f36fd84721380d72a6f390f13",
    category: "Other",
    chain: "stellar",
    txCreatedAt: "2026-03-29T09:18:00.000Z",
    tenantId: "tenant-risk-engine",
    tenantName: "risk-engine",
    ruleCode: "LARGE_FEE_BUMP",
    reason: "Fee-bump cost 1200000 stroops exceeds threshold 1000000 stroops (0.1200000 XLM)",
    status: "false_positive",
    adminNote: "Legitimate batch operation",
    reviewedBy: "admin",
    reviewedAt: "2026-03-29T09:30:00.000Z",
    metadata: { costStroops: 1200000, thresholdStroops: 1000000 },
    createdAt: "2026-03-29T09:18:05.000Z",
    updatedAt: "2026-03-29T09:30:00.000Z"
  }
];

const SAMPLE_STATS: SARStats = {
  summary: { pending: 1, confirmed: 1, falsePositive: 1, last24Hours: 3, last7Days: 3 },
  byRule: [
    { ruleCode: "HIGH_FREQUENCY", pendingCount: 1 },
    { ruleCode: "HIGH_SOROBAN_FEE", pendingCount: 0 },
    { ruleCode: "LARGE_FEE_BUMP", pendingCount: 0 }
  ]
};

function getBaseUrl(): string | null {
  const value = process.env.FLUID_SERVER_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

function getAdminToken(): string | null {
  const value = process.env.FLUID_ADMIN_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchLiveReports(): Promise<{ reports: SARReport[]; total: number }> {
  const baseUrl = getBaseUrl();
  const adminToken = getAdminToken();
  if (!baseUrl || !adminToken) {
    throw new Error("No server URL configured");
  }

  return fetchJson<{ reports: SARReport[]; total: number }>(
    `${baseUrl}/admin/sar?limit=200`,
    { headers: { "x-admin-token": adminToken } }
  );
}

async function fetchLiveStats(): Promise<SARStats> {
  const baseUrl = getBaseUrl();
  const adminToken = getAdminToken();
  if (!baseUrl || !adminToken) {
    throw new Error("No server URL configured");
  }

  return fetchJson<SARStats>(
    `${baseUrl}/admin/sar/stats`,
    { headers: { "x-admin-token": adminToken } }
  );
}

export async function getSARPageData(statusFilter?: string): Promise<SARPageData> {
  const baseUrl = getBaseUrl();
  const source = baseUrl ? "live" : "sample";

  if (source === "sample") {
    const filtered = statusFilter
      ? SAMPLE_REPORTS.filter(r => r.status === statusFilter)
      : SAMPLE_REPORTS;
    return { reports: filtered, total: filtered.length, stats: SAMPLE_STATS, source: "sample" };
  }

  try {
    const [reportsData, stats] = await Promise.all([
      fetchLiveReports(),
      fetchLiveStats()
    ]);

    const reports = statusFilter
      ? reportsData.reports.filter(r => r.status === statusFilter)
      : reportsData.reports;

    return { reports, total: reports.length, stats, source: "live" };
  } catch {
    const filtered = statusFilter
      ? SAMPLE_REPORTS.filter(r => r.status === statusFilter)
      : SAMPLE_REPORTS;
    return { reports: filtered, total: filtered.length, stats: SAMPLE_STATS, source: "sample" };
  }
}
