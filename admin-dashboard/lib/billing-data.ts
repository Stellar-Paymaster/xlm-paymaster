import "server-only";

import { fluidServerUrl, fluidAdminToken } from "@/lib/server-env";

export interface BillingHistoryRow {
  id: string;
  date: string;
  amountCents: number;
  status: "succeeded" | "pending" | "failed";
  description: string;
  invoiceUrl?: string;
}

export interface BillingPageData {
  currentBalanceXlm: number;
  quotaUsedXlm: number;
  quotaTotalXlm: number;
  history: BillingHistoryRow[];
  source: "live" | "sample";
}

const SAMPLE_HISTORY: BillingHistoryRow[] = [
  {
    id: "bh-01",
    date: "2026-03-20T10:00:00Z",
    amountCents: 5000,
    status: "succeeded",
    description: "Quota Top-up (1,500 XLM)",
    invoiceUrl: "#",
  },
  {
    id: "bh-02",
    date: "2026-02-15T14:30:00Z",
    amountCents: 2000,
    status: "succeeded",
    description: "Quota Top-up (500 XLM)",
    invoiceUrl: "#",
  },
  {
    id: "bh-03",
    date: "2026-01-10T09:15:00Z",
    amountCents: 500,
    status: "succeeded",
    description: "Quota Top-up (100 XLM)",
    invoiceUrl: "#",
  },
];

export async function getBillingPageData(): Promise<BillingPageData> {
  const serverUrl = fluidServerUrl.replace(/\/$/, "");
  const adminToken = fluidAdminToken;

  if (!serverUrl || !adminToken) {
    return {
      currentBalanceXlm: 12450.50,
      quotaUsedXlm: 7549.50,
      quotaTotalXlm: 20000,
      history: SAMPLE_HISTORY,
      source: "sample",
    };
  }

  try {
    const response = await fetch(`${serverUrl}/admin/billing/dashboard`, {
      cache: "no-store",
      headers: { "x-admin-token": adminToken },
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    const payload = (await response.json()) as Omit<BillingPageData, "source">;
    return {
      ...payload,
      source: "live",
    };
  } catch {
    return {
      currentBalanceXlm: 12450.50,
      quotaUsedXlm: 7549.50,
      quotaTotalXlm: 20000,
      history: SAMPLE_HISTORY,
      source: "sample",
    };
  }
}
