import "server-only";

import type { DashboardSigner, DashboardTransaction } from "@/components/dashboard/types";

interface HealthApiResponse {
  fee_payers?: Array<{
    publicKey: string;
    status: "Active" | "Low Balance" | "Sequence Error" | "Inactive";
    in_flight?: number;
    total_uses?: number;
    sequence_number?: string | number | null;
    balance?: string | number | null;
  }>;
}

interface TransactionsApiResponse {
  transactions?: Array<{
    id: string;
    hash: string;
    txHash?: string | null;
    innerTxHash?: string;
    category?: string;
    costStroops?: number;
    tenantId: string | null;
    status: "pending" | "submitted" | "success" | "failed";
    createdAt: string;
  }>;
}

export interface DashboardPageData {
  signers: DashboardSigner[];
  transactions: DashboardTransaction[];
  source: "live" | "sample";
}

const SAMPLE_SIGNERS: DashboardSigner[] = [
  {
    id: "signer-01",
    publicKey: "GDQP3KPQGKIHYJGXNUIYOMHARUARCA6QK4F6GZOPFOVS4Q7JH4L6NK7K",
    status: "Active",
    balance: "128.40 XLM",
    inFlight: 2,
    totalUses: 184,
    sequenceNumber: "5420194330214400",
  },
  {
    id: "signer-02",
    publicKey: "GC4YVSVKQK2R3BRQ6WBC6VR7P3CGZ7S2D6WQKIFMK5AQL6C2L2Q5P4K2",
    status: "Active",
    balance: "19.32 XLM",
    inFlight: 1,
    totalUses: 97,
    sequenceNumber: "5420194330214411",
  },
  {
    id: "signer-03",
    publicKey: "GBA2B5DM4QUQ3R4JZPSYLAF5A34Q6VQW2UM3M7LQFPA7MS5QVCQY6Q75",
    status: "Low Balance",
    balance: "0.90 XLM",
    inFlight: 0,
    totalUses: 12,
    sequenceNumber: "5420194330214423",
  },
];

const SAMPLE_TRANSACTIONS: DashboardTransaction[] = [
  {
    id: "tx-01",
    hash: "8d2f4d3e86d1ce8330d189d579179f7837cf0f20cd5dc27af9f7c59e8da92af1",
    amount: "125.00 USDC",
    asset: "USDC",
    category: "Token Transfer",
    status: "submitted",
    tenantId: "anchor-west",
    createdAt: "Mar 26, 2026 09:10",
    updatedAt: "Mar 26, 2026 09:12",
  },
  {
    id: "tx-02",
    hash: "d7864d77f3bd6407eb6ab9f1f9fd14ca1ce0a1ecf911ce9b0f31d9cc354d0bf7",
    amount: "42.50 XLM",
    asset: "XLM",
    category: "DEX Swap",
    status: "success",
    tenantId: "mobile-wallet",
    createdAt: "Mar 26, 2026 08:48",
    updatedAt: "Mar 26, 2026 08:49",
  },
  {
    id: "tx-03",
    hash: "1dfd3e1a1f2c7d45a8a438b74a90c6fc5a50bf8d28d1f6ce4abcc7a5e83fe366",
    amount: "9,800 AQUA",
    asset: "AQUA",
    category: "Soroban Contract",
    status: "failed",
    tenantId: "market-maker",
    createdAt: "Mar 26, 2026 07:36",
    updatedAt: "Mar 26, 2026 07:41",
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBalance(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Unavailable";
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return `${value}`;
  }

  return `${numericValue.toFixed(2)} XLM`;
}

function getBaseUrl() {
  const value = process.env.FLUID_SERVER_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

function getAdminToken() {
  const value = process.env.FLUID_ADMIN_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getDashboardPageData(): Promise<DashboardPageData> {
  const baseUrl = getBaseUrl();
  const adminToken = getAdminToken();

  if (!baseUrl || !adminToken) {
    return {
      signers: SAMPLE_SIGNERS,
      transactions: SAMPLE_TRANSACTIONS,
      source: "sample",
    };
  }

  try {
    const [health, transactions] = await Promise.all([
      fetchJson<HealthApiResponse>(`${baseUrl}/health`),
      fetch(`${baseUrl}/admin/transactions?limit=8`, {
        cache: "no-store",
        headers: { "x-admin-token": adminToken },
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        return response.json() as Promise<TransactionsApiResponse>;
      }),
    ]);

    return {
      signers:
        health.fee_payers?.map((signer, index) => ({
          id: `signer-${index + 1}`,
          publicKey: signer.publicKey,
          status: signer.status,
          balance: formatBalance(signer.balance),
          inFlight: signer.in_flight ?? 0,
          totalUses: signer.total_uses ?? 0,
          sequenceNumber: signer.sequence_number?.toString() ?? "Unavailable",
        })) ?? SAMPLE_SIGNERS,
      transactions:
        transactions.transactions?.map((transaction, index) => ({
          id: transaction.id || `tx-${index + 1}`,
          hash: transaction.hash,
          amount:
            typeof transaction.costStroops === "number"
              ? `${transaction.costStroops.toLocaleString()} stroops`
              : "Unavailable",
          asset: "XLM",
          category: transaction.category ?? "Other",
          status: transaction.status,
          tenantId: transaction.tenantId ?? "deleted-tenant",
          createdAt: formatDate(transaction.createdAt),
          updatedAt: formatDate(transaction.createdAt),
        })) ?? SAMPLE_TRANSACTIONS,
      source: "live",
    };
  } catch {
    return {
      signers: SAMPLE_SIGNERS,
      transactions: SAMPLE_TRANSACTIONS,
      source: "sample",
    };
  }
}

export function getDashboardPreviewData(): DashboardPageData {
  return {
    signers: SAMPLE_SIGNERS,
    transactions: SAMPLE_TRANSACTIONS,
    source: "sample",
  };
}
