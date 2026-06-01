import "server-only";

import type { TransactionHistoryRow } from "@/components/dashboard/types";

export interface ExpenseBreakdownData {
  classic: {
    totalStroops: number;
    percentage: number;
    transactionCount: number;
  };
  soroban: {
    totalStroops: number;
    percentage: number;
    transactionCount: number;
  };
  totalStroops: number;
  source: "live" | "sample";
}

const SAMPLE_TRANSACTIONS: Pick<TransactionHistoryRow, "category" | "costStroops">[] = [
  { category: "Token Transfer", costStroops: 18240 },
  { category: "DEX Swap", costStroops: 24410 },
  { category: "Soroban Contract", costStroops: 39870 },
  { category: "Token Transfer", costStroops: 17600 },
  { category: "Trustline Management", costStroops: 12950 },
  { category: "Other", costStroops: 30120 },
  { category: "Account Funding", costStroops: 15000 },
  { category: "DEX Swap", costStroops: 41760 },
  { category: "Token Transfer", costStroops: 26610 },
  { category: "Token Transfer", costStroops: 14120 },
  { category: "NFT Mint", costStroops: 39005 },
  { category: "Account Configuration", costStroops: 13340 },
  { category: "Soroban Contract", costStroops: 52300 },
  { category: "Soroban Contract", costStroops: 48750 },
  { category: "Soroban Contract", costStroops: 61200 },
];

interface TransactionsApiResponse {
  transactions?: Array<{
    id: string;
    hash: string;
    category?: string;
    costStroops?: number;
    tenantId: string;
    status: "pending" | "submitted" | "success" | "failed";
    createdAt: string;
  }>;
}

function getBaseUrl() {
  const value = process.env.FLUID_SERVER_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

function getAdminToken() {
  const value = process.env.FLUID_ADMIN_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

function isSorobanCategory(category: string): boolean {
  const normalizedCategory = category.toLowerCase();
  return (
    normalizedCategory.includes("soroban") ||
    normalizedCategory.includes("contract")
  );
}

function aggregateExpenses(
  transactions: Pick<TransactionHistoryRow, "category" | "costStroops">[]
): Omit<ExpenseBreakdownData, "source"> {
  let classicStroops = 0;
  let classicCount = 0;
  let sorobanStroops = 0;
  let sorobanCount = 0;

  for (const tx of transactions) {
    if (isSorobanCategory(tx.category)) {
      sorobanStroops += tx.costStroops;
      sorobanCount += 1;
    } else {
      classicStroops += tx.costStroops;
      classicCount += 1;
    }
  }

  const totalStroops = classicStroops + sorobanStroops;

  return {
    classic: {
      totalStroops: classicStroops,
      percentage: totalStroops > 0 ? (classicStroops / totalStroops) * 100 : 0,
      transactionCount: classicCount,
    },
    soroban: {
      totalStroops: sorobanStroops,
      percentage: totalStroops > 0 ? (sorobanStroops / totalStroops) * 100 : 0,
      transactionCount: sorobanCount,
    },
    totalStroops,
  };
}

export async function getExpenseBreakdownData(): Promise<ExpenseBreakdownData> {
  const baseUrl = getBaseUrl();
  const adminToken = getAdminToken();

  if (!baseUrl || !adminToken) {
    return {
      ...aggregateExpenses(SAMPLE_TRANSACTIONS),
      source: "sample",
    };
  }

  try {
    const response = await fetch(`${baseUrl}/admin/transactions?limit=1000`, {
      cache: "no-store",
      headers: { "x-admin-token": adminToken },
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const data = (await response.json()) as TransactionsApiResponse;
    const transactions = (data.transactions ?? []).map((tx) => ({
      category: tx.category ?? "Other",
      costStroops: typeof tx.costStroops === "number" ? tx.costStroops : 0,
    }));

    if (transactions.length === 0) {
      return {
        ...aggregateExpenses(SAMPLE_TRANSACTIONS),
        source: "sample",
      };
    }

    return {
      ...aggregateExpenses(transactions),
      source: "live",
    };
  } catch {
    return {
      ...aggregateExpenses(SAMPLE_TRANSACTIONS),
      source: "sample",
    };
  }
}