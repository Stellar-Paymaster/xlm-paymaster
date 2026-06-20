"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ServerLogStreamViewer } from "@/components/dashboard/ServerLogStreamViewer";
import { WebhookDeliveryLogTable } from "@/components/dashboard/WebhookDeliveryLog";
import type { WebhookDeliveryPageData, WebhookDeliveryQuery } from "@/components/dashboard/types";
import { getWebhookDeliveryLogsData } from "@/lib/webhook-delivery-logs-data";

export default function AdminWebhookLogsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<WebhookDeliveryPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<WebhookDeliveryQuery>({
    page: 1,
    pageSize: 10,
    search: "",
    sort: "time_desc",
    statusFilter: [],
    eventTypeFilter: [],
    tenantFilter: []
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await getWebhookDeliveryLogsData(
          query.page,
          query.pageSize,
          query.search,
          query.sort,
          query.statusFilter,
          query.eventTypeFilter,
          query.tenantFilter
        );
        setData(result);
      } catch (error) {
        console.error("Failed to fetch webhook delivery logs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [query]);

  const handlePageChange = (page: number) => {
    setQuery(prev => ({ ...prev, page }));
  };

  const handleQueryChange = (updates: Partial<WebhookDeliveryQuery>) => {
    setQuery(prev => ({ ...prev, ...updates, page: 1 }));
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="animate-pulse">
              <div className="h-8 bg-slate-300 rounded w-48 mb-2"></div>
              <div className="h-12 bg-slate-300 rounded w-96"></div>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            <div className="h-64 bg-slate-200 rounded"></div>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <p className="text-red-600">Failed to load webhook delivery logs</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
                Paymaster Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">
                Webhook Delivery Logs
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Monitor webhook delivery attempts, failures, and retry logic in real-time.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="font-medium text-slate-900">
                  {session?.user?.email}
                </div>
                <div>
                  {data.source === "live" ? "Live server data" : "Sample data"}
                </div>
              </div>
              <Link
                href="/admin/webhooks"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Back to Settings
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <ServerLogStreamViewer />
        <WebhookDeliveryLogTable
          data={data}
          onPageChange={handlePageChange}
          onQueryChange={handleQueryChange}
        />
      </div>
    </main>
  );
}
