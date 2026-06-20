export interface AuditLogEntry {
  actionCategory: string;
  id: string;
  actor: string;
  action: string;
  ipAddress: string | null;
  target: string | null;
  metadata: string | null;
  aiSummary: string | null;
  createdAt: string;
  riskScore: number;
}

export interface AuditLogPageData {
  actionCategories: string[];
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
  source: "live" | "sample";
}

export type AuditLogTimePeriod = "all" | "24h" | "7d" | "30d";

export interface AuditLogFilters {
  actionCategory?: string;
  ipAddress?: string;
  maxRiskScore?: number;
  minRiskScore?: number;
  timePeriod?: AuditLogTimePeriod;
}

const SAMPLE_AUDIT_LOGS: AuditLogEntry[] = [
  {
    actionCategory: "Tenant",
    id: "al_001",
    actor: "admin@paymaster.dev",
    action: "tenant.create",
    ipAddress: "203.0.113.42",
    target: "tenant_001",
    metadata: JSON.stringify({ name: "Acme Corp", tier: "pro" }),
    aiSummary: "Admin created new tenant Acme Corp on the pro tier",
    createdAt: "2026-05-31T10:30:00Z",
    riskScore: 24,
  },
  {
    actionCategory: "API Key",
    id: "al_002",
    actor: "system",
    action: "apikey.revoke",
    ipAddress: "198.51.100.10",
    target: "key_abc123",
    metadata: JSON.stringify({ reason: "expired" }),
    aiSummary: "System auto-revoked expired API key",
    createdAt: "2026-05-30T09:15:00Z",
    riskScore: 78,
  },
  {
    actionCategory: "Signer",
    id: "al_003",
    actor: "admin@paymaster.dev",
    action: "signer.add",
    ipAddress: "203.0.113.42",
    target: "GABCD...WXYZ",
    metadata: null,
    aiSummary: null,
    createdAt: "2026-05-24T14:00:00Z",
    riskScore: 46,
  },
  {
    actionCategory: "Auth",
    id: "al_004",
    actor: "operator@paymaster.dev",
    action: "auth.login_failed",
    ipAddress: "192.0.2.88",
    target: "operator@paymaster.dev",
    metadata: JSON.stringify({ attempts: 5 }),
    aiSummary: "Multiple failed sign-in attempts from a new network",
    createdAt: "2026-04-18T08:45:00Z",
    riskScore: 91,
  },
];

function getBaseUrl() {
  const value = process.env.PAYMASTER_SERVER_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

function getAdminToken() {
  const value = process.env.PAYMASTER_ADMIN_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

export async function getAuditLogsData(
  limit = 50,
  offset = 0,
  filters: AuditLogFilters = {},
): Promise<AuditLogPageData> {
  const baseUrl = getBaseUrl();
  const token = getAdminToken();
  const normalizedFilters = normalizeAuditLogFilters(filters);

  if (baseUrl && token) {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (normalizedFilters.actionCategory) {
        params.set("category", normalizedFilters.actionCategory);
      }
      if (normalizedFilters.ipAddress) {
        params.set("ip", normalizedFilters.ipAddress);
      }
      if (normalizedFilters.timePeriod && normalizedFilters.timePeriod !== "all") {
        params.set("period", normalizedFilters.timePeriod);
      }
      if (normalizedFilters.minRiskScore !== undefined) {
        params.set("minRiskScore", String(normalizedFilters.minRiskScore));
      }
      if (normalizedFilters.maxRiskScore !== undefined) {
        params.set("maxRiskScore", String(normalizedFilters.maxRiskScore));
      }

      const res = await fetch(`${baseUrl}/admin/audit-logs?${params}`, {
        headers: { "x-admin-token": token },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const items = (data.items ?? []).map(normalizeAuditLogEntry);
        return {
          ...data,
          actionCategories: extractActionCategories(items),
          items,
          source: "live",
        };
      }
    } catch {
      // fall through to sample
    }
  }

  const filteredItems = filterAuditLogs(SAMPLE_AUDIT_LOGS, normalizedFilters);

  return {
    actionCategories: extractActionCategories(SAMPLE_AUDIT_LOGS),
    items: filteredItems.slice(offset, offset + limit),
    total: filteredItems.length,
    limit,
    offset,
    source: "sample",
  };
}

export function normalizeAuditLogFilters(filters: AuditLogFilters): AuditLogFilters {
  const minRiskScore = clampRiskScore(filters.minRiskScore);
  const maxRiskScore = clampRiskScore(filters.maxRiskScore);

  return {
    actionCategory: filters.actionCategory?.trim() || undefined,
    ipAddress: filters.ipAddress?.trim() || undefined,
    maxRiskScore,
    minRiskScore,
    timePeriod: filters.timePeriod ?? "all",
  };
}

export function filterAuditLogs(
  entries: AuditLogEntry[],
  filters: AuditLogFilters,
  now = new Date(),
): AuditLogEntry[] {
  const normalized = normalizeAuditLogFilters(filters);
  const startTime = getPeriodStart(normalized.timePeriod ?? "all", now);

  return entries.filter((entry) => {
    if (
      normalized.ipAddress &&
      !(entry.ipAddress ?? "").toLowerCase().includes(normalized.ipAddress.toLowerCase())
    ) {
      return false;
    }

    if (
      normalized.actionCategory &&
      entry.actionCategory.toLowerCase() !== normalized.actionCategory.toLowerCase()
    ) {
      return false;
    }

    if (startTime && new Date(entry.createdAt).getTime() < startTime.getTime()) {
      return false;
    }

    if (
      normalized.minRiskScore !== undefined &&
      entry.riskScore < normalized.minRiskScore
    ) {
      return false;
    }

    if (
      normalized.maxRiskScore !== undefined &&
      entry.riskScore > normalized.maxRiskScore
    ) {
      return false;
    }

    return true;
  });
}

export function extractActionCategories(entries: AuditLogEntry[]): string[] {
  return Array.from(
    new Set(entries.map((entry) => entry.actionCategory).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

function clampRiskScore(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function getPeriodStart(period: AuditLogTimePeriod, now: Date): Date | null {
  const hoursByPeriod: Record<Exclude<AuditLogTimePeriod, "all">, number> = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };

  if (period === "all") {
    return null;
  }

  return new Date(now.getTime() - hoursByPeriod[period] * 60 * 60 * 1000);
}

function normalizeAuditLogEntry(entry: Partial<AuditLogEntry>): AuditLogEntry {
  const action = entry.action ?? "unknown";

  return {
    id: entry.id ?? `audit-${action}-${entry.createdAt ?? "unknown"}`,
    actor: entry.actor ?? "unknown",
    action,
    actionCategory: entry.actionCategory || deriveActionCategory(action),
    aiSummary: entry.aiSummary ?? null,
    createdAt: entry.createdAt ?? new Date(0).toISOString(),
    ipAddress: entry.ipAddress ?? null,
    metadata: entry.metadata ?? null,
    riskScore: clampRiskScore(entry.riskScore) ?? 0,
    target: entry.target ?? null,
  };
}

function deriveActionCategory(action: string): string {
  const namespace = action.split(".")[0]?.trim();

  if (!namespace) {
    return "Other";
  }

  return namespace
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
