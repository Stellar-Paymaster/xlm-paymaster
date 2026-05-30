import "server-only";

import { getDashboardPageData } from "@/lib/dashboard-data";
import {
  getTransactionHistoryPageData,
  parseTransactionHistoryQuery,
} from "@/lib/transaction-history";

interface AiSupportSettings {
  model: string;
  provider: string;
}

interface BuildOperatorSupportContextInput {
  adminEmail: string;
  query: string;
  settings: AiSupportSettings;
}

export interface SupportContextDoc {
  excerpt: string;
  source: string;
}

export interface SupportContext {
  adminEmail: string;
  docs: SupportContextDoc[];
  nodeConfig: {
    healthStatus: string | null;
    source: "live" | "sample";
  };
  query: string;
  recentTransactions: Array<{
    category: string;
    status: string;
    tenant: string;
    timestamp: string;
  }>;
  settings: AiSupportSettings;
}

const SUPPORT_DOCS: SupportContextDoc[] = [
  {
    source: "operator-runbook",
    excerpt:
      "Review signer health, transaction error clusters, and tenant-level spikes before changing fee-bump capacity.",
  },
  {
    source: "dashboard-playbook",
    excerpt:
      "Correlate webhook failures, signer balance, and recent transaction outcomes when triaging delivery or settlement incidents.",
  },
  {
    source: "accessibility-guidance",
    excerpt:
      "Use explicit operator controls for theme changes and preserve high-contrast legibility for critical workflows.",
  },
];

function inferHealthStatus(
  signers: Awaited<ReturnType<typeof getDashboardPageData>>["signers"],
) {
  if (signers.some((signer) => signer.status === "Sequence Error")) {
    return "degraded";
  }

  if (signers.some((signer) => signer.status === "Low Balance")) {
    return "warning";
  }

  return "healthy";
}

export async function buildOperatorSupportContext(
  input: BuildOperatorSupportContextInput,
): Promise<SupportContext> {
  const [dashboard, history] = await Promise.all([
    getDashboardPageData(),
    getTransactionHistoryPageData(parseTransactionHistoryQuery({ page: "1", pageSize: "5" })),
  ]);

  return {
    adminEmail: input.adminEmail,
    query: input.query,
    settings: input.settings,
    docs: SUPPORT_DOCS,
    nodeConfig: {
      healthStatus: inferHealthStatus(dashboard.signers),
      source: dashboard.source,
    },
    recentTransactions: history.rows.slice(0, 5).map((row) => ({
      timestamp: row.timestamp,
      tenant: row.tenant,
      status: row.status,
      category: row.category,
    })),
  };
}
