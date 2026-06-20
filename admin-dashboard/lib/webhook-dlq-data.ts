import "server-only";
import type { WebhookDlqItem } from "@/components/dashboard/types";

const SAMPLE_DLQ_ITEMS: WebhookDlqItem[] = [
  {
    id: "dlq-sample-1",
    tenantId: "anchor-west",
    tenantName: "Anchor West",
    deliveryId: "del-001",
    url: "https://anchor-west.example.com/webhooks/paymaster",
    payload: JSON.stringify({ eventType: "tx.failed", hash: "abc123", status: "failed" }),
    lastError: "Connection timeout after 5000ms",
    retryCount: 5,
    failedAt: new Date("2026-03-25T14:30:00.000Z").toISOString(),
    expiresAt: new Date("2026-04-24T14:30:00.000Z").toISOString(),
  },
  {
    id: "dlq-sample-2",
    tenantId: "mobile-wallet",
    tenantName: "Mobile Wallet",
    deliveryId: "del-002",
    url: "https://wallet.example.com/paymaster/webhooks",
    payload: JSON.stringify({ eventType: "tx.success", hash: "def456", status: "success" }),
    lastError: "HTTP 502 Bad Gateway",
    retryCount: 5,
    failedAt: new Date("2026-03-26T09:15:00.000Z").toISOString(),
    expiresAt: new Date("2026-04-25T09:15:00.000Z").toISOString(),
  },
];

export interface WebhookDlqPageData {
  items: WebhookDlqItem[];
  source: "live" | "sample";
}

export async function getWebhookDlqPageData(): Promise<WebhookDlqPageData> {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.replace(/\/$/, "") ?? "";
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN ?? "";

  if (!serverUrl || !adminToken) {
    return { items: SAMPLE_DLQ_ITEMS, source: "sample" };
  }

  try {
    const res = await fetch(`${serverUrl}/admin/webhooks/dlq`, {
      cache: "no-store",
      headers: {
        "x-admin-token": adminToken,
      },
    });

    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }

    const data = await res.json();
    return {
      items: (data.items ?? []) as WebhookDlqItem[],
      source: "live",
    };
  } catch {
    return { items: SAMPLE_DLQ_ITEMS, source: "sample" };
  }
}
