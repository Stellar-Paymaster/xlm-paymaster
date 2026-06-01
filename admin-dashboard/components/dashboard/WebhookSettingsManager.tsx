"use client";

import { useState } from "react";
import type {
  WebhookEventType,
  WebhookTenantSettings,
} from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const EVENT_TYPE_LABELS: Array<{
  value: WebhookEventType;
  title: string;
  description: string;
}> = [
  {
    value: "tx.success",
    title: "Transaction Success",
    description: "Send an event after a sponsored transaction lands successfully.",
  },
  {
    value: "tx.failed",
    title: "Transaction Failure",
    description: "Send an event when a monitored sponsored transaction fails.",
  },
  {
    value: "balance.low",
    title: "Low Balance",
    description: "Send an event when low-balance alerting is triggered for the tenant.",
  },
];

type SaveState = {
  saving: boolean;
  error: string | null;
  success: string | null;
};

function normalizeEventTypes(eventTypes: WebhookEventType[]): WebhookEventType[] {
  return EVENT_TYPE_LABELS.map((entry) => entry.value).filter((eventType) =>
    eventTypes.includes(eventType),
  );
}

export function WebhookSettingsManager({
  initialRows,
}: {
  initialRows: WebhookTenantSettings[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [saveStateByTenant, setSaveStateByTenant] = useState<Record<string, SaveState>>({});
  const [pendingSave, setPendingSave] = useState<WebhookTenantSettings | null>(null);

  const updateRow = (tenantId: string, updater: (row: WebhookTenantSettings) => WebhookTenantSettings) => {
    setRows((current) =>
      current.map((row) => (row.tenantId === tenantId ? updater(row) : row)),
    );
  };

  const toggleEventType = (tenantId: string, eventType: WebhookEventType, checked: boolean) => {
    updateRow(tenantId, (row) => {
      const next = checked
        ? [...row.eventTypes, eventType]
        : row.eventTypes.filter((item) => item !== eventType);

      return {
        ...row,
        eventTypes: normalizeEventTypes(next),
      };
    });
  };

  const updateWebhookUrl = (tenantId: string, webhookUrl: string) => {
    updateRow(tenantId, (row) => ({
      ...row,
      webhookUrl,
    }));
  };

  const saveTenantSettings = async (row: WebhookTenantSettings) => {
    setSaveStateByTenant((current) => ({
      ...current,
      [row.tenantId]: { saving: true, error: null, success: null },
    }));

    try {
      const response = await fetch(`/api/admin/webhooks/${encodeURIComponent(row.tenantId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          webhookUrl: row.webhookUrl ?? null,
          eventTypes: row.eventTypes,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save webhook settings");
      }

      updateRow(row.tenantId, () => payload as WebhookTenantSettings);
      setSaveStateByTenant((current) => ({
        ...current,
        [row.tenantId]: { saving: false, error: null, success: "Saved" },
      }));
    } catch (error) {
      setSaveStateByTenant((current) => ({
        ...current,
        [row.tenantId]: {
          saving: false,
          error: error instanceof Error ? error.message : "Failed to save webhook settings",
          success: null,
        },
      }));
    }
  };

  return (
    <>
    <div className="space-y-6">
      {rows.map((row) => {
        const state = saveStateByTenant[row.tenantId] ?? {
          saving: false,
          error: null,
          success: null,
        };

        return (
          <Card key={row.tenantId}>
            <CardHeader className="gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{row.tenantName ?? row.tenantId}</CardTitle>
                  <CardDescription>
                    Tenant ID: {row.tenantId}
                  </CardDescription>
                </div>
                <div className="text-sm text-muted-foreground">
                  {row.updatedAt ? `Updated ${new Date(row.updatedAt).toLocaleString()}` : "Not saved yet"}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Webhook URL
                </label>
                <Input
                  value={row.webhookUrl ?? ""}
                  onChange={(event) => updateWebhookUrl(row.tenantId, event.target.value)}
                  placeholder="https://tenant.example.com/webhooks/fluid"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to disable webhook delivery for this tenant.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Event Types</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    By default, all event types are enabled. Toggle off the ones this tenant does not want.
                  </p>
                </div>

                <div className="space-y-3">
                  {EVENT_TYPE_LABELS.map((eventType) => (
                    <div
                      key={eventType.value}
                      className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3"
                    >
                      <div>
                        <div className="font-medium text-foreground">{eventType.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {eventType.description}
                        </div>
                      </div>
                      <Switch
                        checked={row.eventTypes.includes(eventType.value)}
                        onCheckedChange={(checked) =>
                          toggleEventType(row.tenantId, eventType.value, checked)
                        }
                        aria-label={`${eventType.title} toggle`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    if (!row.webhookUrl || row.webhookUrl.trim() === "") {
                      setPendingSave(row);
                    } else {
                      void saveTenantSettings(row);
                    }
                  }}
                  disabled={state.saving}
                >
                  {state.saving ? "Saving..." : "Save settings"}
                </Button>
                {state.success ? (
                  <span className="text-sm text-emerald-600">{state.success}</span>
                ) : null}
                {state.error ? (
                  <span className="text-sm text-red-600">{state.error}</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>

    <ConfirmDialog
      open={pendingSave !== null}
      onOpenChange={(open) => { if (!open) setPendingSave(null); }}
      title="Disable Webhook Delivery"
      description={
        pendingSave
          ? `Saving with an empty URL will disable all webhook delivery for tenant "${pendingSave.tenantName ?? pendingSave.tenantId}". Are you sure you want to continue?`
          : ""
      }
      confirmLabel="Yes, disable webhooks"
      cancelLabel="Cancel"
      onConfirm={() => {
        if (pendingSave) {
          const rowToSave = pendingSave;
          setPendingSave(null);
          void saveTenantSettings(rowToSave);
        }
      }}
      onCancel={() => setPendingSave(null)}
      variant="destructive"
      isLoading={pendingSave !== null && (saveStateByTenant[pendingSave.tenantId]?.saving ?? false)}
    />
    </>
  );
}
