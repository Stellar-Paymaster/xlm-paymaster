"use client";

import { useState, useMemo } from "react";
import type {
  WebhookDeliveryLog,
  WebhookDeliveryStatus,
  WebhookEventType,
  WebhookDeliverySort,
  WebhookDeliveryQuery,
} from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { CopyButton } from "./CopyButton";

const STATUS_OPTIONS: Array<{ value: WebhookDeliveryStatus; label: string }> = [
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "retrying", label: "Retrying" },
];

const EVENT_TYPE_OPTIONS: Array<{ value: WebhookEventType; label: string }> = [
  { value: "tx.success", label: "Transaction Success" },
  { value: "tx.failed", label: "Transaction Failure" },
  { value: "balance.low", label: "Low Balance" },
];

const SORT_OPTIONS: Array<{ value: WebhookDeliverySort; label: string }> = [
  { value: "time_desc", label: "Newest First" },
  { value: "time_asc", label: "Oldest First" },
  { value: "status_asc", label: "Status (A-Z)" },
  { value: "status_desc", label: "Status (Z-A)" },
  { value: "attempts_desc", label: "Most Attempts" },
  { value: "attempts_asc", label: "Least Attempts" },
];

interface WebhookDeliveryLogProps {
  data: {
    rows: WebhookDeliveryLog[];
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    sort: WebhookDeliverySort;
    search: string;
    statusFilter: WebhookDeliveryStatus[];
    eventTypeFilter: WebhookEventType[];
    tenantFilter: string[];
    source: "live" | "sample";
  };
  onPageChange: (page: number) => void;
  onQueryChange: (query: Partial<WebhookDeliveryQuery>) => void;
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </h5>
      {children}
    </div>
  );
}

function JsonBlock({ value }: { value: Record<string, unknown> | Record<string, string> }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function WebhookDeliveryLogTable({
  data,
  onPageChange,
  onQueryChange,
}: WebhookDeliveryLogProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const formatTimestamp = (timestamp: string) =>
    new Date(timestamp).toLocaleString();

  const filteredRows = useMemo(() => {
    let rows = [...data.rows];

    if (data.search) {
      const q = data.search.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.tenantName?.toLowerCase().includes(q) ||
          row.tenantId.toLowerCase().includes(q) ||
          row.webhookUrl.toLowerCase().includes(q),
      );
    }

    if (data.statusFilter.length > 0) {
      rows = rows.filter((row) => data.statusFilter.includes(row.status));
    }

    if (data.eventTypeFilter.length > 0) {
      rows = rows.filter((row) => data.eventTypeFilter.includes(row.eventType));
    }

    if (data.tenantFilter.length > 0) {
      rows = rows.filter((row) => data.tenantFilter.includes(row.tenantId));
    }

    return rows;
  }, [data.rows, data.search, data.statusFilter, data.eventTypeFilter, data.tenantFilter]);

  const toggleStatusFilter = (status: WebhookDeliveryStatus) => {
    const newFilter = data.statusFilter.includes(status)
      ? data.statusFilter.filter((s) => s !== status)
      : [...data.statusFilter, status];
    onQueryChange({ statusFilter: newFilter });
  };

  const toggleEventTypeFilter = (eventType: WebhookEventType) => {
    const newFilter = data.eventTypeFilter.includes(eventType)
      ? data.eventTypeFilter.filter((e) => e !== eventType)
      : [...data.eventTypeFilter, eventType];
    onQueryChange({ eventTypeFilter: newFilter });
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter webhook delivery logs by status, event type, and search.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Search</label>
            <Input
              placeholder="Search by tenant, URL..."
              value={data.search}
              onChange={(e) => onQueryChange({ search: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((status) => (
                <Button
                  key={status.value}
                  variant={data.statusFilter.includes(status.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleStatusFilter(status.value)}
                >
                  {status.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Event Type</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPE_OPTIONS.map((eventType) => (
                <Button
                  key={eventType.value}
                  variant={data.eventTypeFilter.includes(eventType.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEventTypeFilter(eventType.value)}
                >
                  {eventType.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Sort By</label>
            <select
              value={data.sort}
              onChange={(e) =>
                onQueryChange({ sort: e.target.value as WebhookDeliverySort })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SORT_OPTIONS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Results summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredRows.length} of {data.totalRows} delivery logs
          {data.source === "sample" && " (sample data)"}
        </p>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Timestamp</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Tenant</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Event</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Attempts</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Response</th>
                  <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">
                    Webhook URL
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const isOpen = expandedRow === row.id;

                  return (
                    <>
                      <tr key={row.id} className="border-b hover:bg-muted/25">
                        <td className="px-4 py-3 text-sm">
                          <div>{formatTimestamp(row.createdAt)}</div>
                          {row.nextRetryAt && (
                            <div className="text-xs text-muted-foreground">
                              Next retry: {formatTimestamp(row.nextRetryAt)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium">{row.tenantName ?? row.tenantId}</div>
                          <div className="text-xs text-muted-foreground">{row.tenantId}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {EVENT_TYPE_OPTIONS.find((o) => o.value === row.eventType)?.label ??
                            row.eventType}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          {row.attempts}/{row.maxAttempts}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {row.responseCode !== null ? (
                            <div>
                              <div
                                className={`font-medium ${
                                  row.responseCode >= 200 && row.responseCode < 300
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {row.responseCode}
                              </div>
                              {row.responseMessage && (
                                <div className="max-w-32 truncate text-xs text-muted-foreground">
                                  {row.responseMessage}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-sm md:table-cell">
                          <div className="max-w-48 truncate" title={row.webhookUrl}>
                            {row.webhookUrl}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <CopyButton value={row.id} label="Copy ID" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setExpandedRow(isOpen ? null : row.id)
                              }
                              aria-expanded={isOpen}
                            >
                              {isOpen ? "Hide" : "Details"}
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable details drawer */}
                      {isOpen && (
                        <tr key={`${row.id}-drawer`} className="bg-muted/10">
                          <td colSpan={8} className="px-4 py-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                              <DrawerSection title="Request Payload">
                                {Object.keys(row.requestPayload).length > 0 ? (
                                  <JsonBlock value={row.requestPayload} />
                                ) : (
                                  <p className="text-xs text-muted-foreground">No request payload</p>
                                )}
                              </DrawerSection>

                              <DrawerSection title="Response Headers">
                                {Object.keys(row.responseHeaders).length > 0 ? (
                                  <JsonBlock value={row.responseHeaders} />
                                ) : (
                                  <p className="text-xs text-muted-foreground">No response headers</p>
                                )}
                              </DrawerSection>

                              <DrawerSection title="Event Payload">
                                <JsonBlock value={row.payload} />
                              </DrawerSection>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
                              <span>
                                <span className="font-medium text-foreground">Delivery ID:</span>{" "}
                                {row.id}
                              </span>
                              <span>
                                <span className="font-medium text-foreground">Webhook URL:</span>{" "}
                                {row.webhookUrl}
                              </span>
                              {row.nextRetryAt && (
                                <span>
                                  <span className="font-medium text-foreground">
                                    Next Retry:
                                  </span>{" "}
                                  {formatTimestamp(row.nextRetryAt)}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No webhook delivery logs found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your filters or search criteria
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(data.page - 1)}
            disabled={data.page <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(data.page + 1)}
            disabled={data.page >= data.totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
