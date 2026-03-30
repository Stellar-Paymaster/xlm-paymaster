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

export function WebhookDeliveryLogTable({
  data,
  onPageChange,
  onQueryChange,
}: WebhookDeliveryLogProps) {
  const [showPayload, setShowPayload] = useState<string | null>(null);

  const getStatusVariant = (status: WebhookDeliveryStatus) => {
    switch (status) {
      case "success":
        return "success";
      case "failed":
        return "error";
      case "pending":
        return "warning";
      case "retrying":
        return "info";
      default:
        return "default";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const filteredRows = useMemo(() => {
    let rows = [...data.rows];

    if (data.search) {
      rows = rows.filter(
        (row) =>
          row.tenantName?.toLowerCase().includes(data.search.toLowerCase()) ||
          row.tenantId.toLowerCase().includes(data.search.toLowerCase()) ||
          row.webhookUrl.toLowerCase().includes(data.search.toLowerCase())
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
          {/* Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Search</label>
            <Input
              placeholder="Search by tenant, URL..."
              value={data.search}
              onChange={(e) => onQueryChange({ search: e.target.value })}
            />
          </div>

          {/* Status Filter */}
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

          {/* Event Type Filter */}
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

          {/* Sort */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Sort By</label>
            <select
              value={data.sort}
              onChange={(e) => onQueryChange({ sort: e.target.value as WebhookDeliverySort })}
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

      {/* Results Summary */}
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
                  <th className="px-4 py-3 text-left text-sm font-medium">Event Type</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Attempts</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Response</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Webhook URL</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-muted/25">
                    <td className="px-4 py-3 text-sm">
                      <div className="space-y-1">
                        <div>{formatTimestamp(row.createdAt)}</div>
                        {row.nextRetryAt && (
                          <div className="text-xs text-muted-foreground">
                            Next retry: {formatTimestamp(row.nextRetryAt)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="space-y-1">
                        <div className="font-medium">{row.tenantName || row.tenantId}</div>
                        <div className="text-xs text-muted-foreground">{row.tenantId}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {EVENT_TYPE_OPTIONS.find(opt => opt.value === row.eventType)?.label || row.eventType}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={row.status} variant={getStatusVariant(row.status)} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="text-center">
                        {row.attempts}/{row.maxAttempts}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.responseCode ? (
                        <div className="space-y-1">
                          <div className={`font-medium ${
                            row.responseCode >= 200 && row.responseCode < 300 
                              ? 'text-green-600' 
                              : 'text-red-600'
                          }`}>
                            {row.responseCode}
                          </div>
                          {row.responseMessage && (
                            <div className="text-xs text-muted-foreground max-w-32 truncate">
                              {row.responseMessage}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
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
                          onClick={() => setShowPayload(showPayload === row.id ? null : row.id)}
                        >
                          {showPayload === row.id ? "Hide" : "Payload"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payload Details */}
          {showPayload && (
            <div className="border-t bg-muted/25 p-4">
              <h4 className="mb-2 text-sm font-medium">Payload Details</h4>
              <pre className="max-h-64 overflow-auto rounded bg-background p-3 text-xs">
                {JSON.stringify(
                  filteredRows.find((row) => row.id === showPayload)?.payload,
                  null,
                  2
                )}
              </pre>
            </div>
          )}

          {/* Empty State */}
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
