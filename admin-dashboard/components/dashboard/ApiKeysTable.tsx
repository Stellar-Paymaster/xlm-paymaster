"use client";

import { useState } from "react";
import { ShieldOff } from "lucide-react";
import type { ApiKey, ChainId } from "@/components/dashboard/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CopyButton } from "@/components/dashboard/CopyButton";

interface ApiKeysTableProps {
  initialKeys: ApiKey[];
  serverUrl: string;
  adminToken: string;
}

const ALL_CHAINS: ChainId[] = ["stellar", "evm", "solana", "cosmos"];

const CHAIN_COLORS: Record<ChainId, string> = {
  stellar: "bg-sky-50 text-sky-700 ring-sky-200",
  evm: "bg-violet-50 text-violet-700 ring-violet-200",
  solana: "bg-teal-50 text-teal-700 ring-teal-200",
  cosmos: "bg-amber-50 text-amber-700 ring-amber-200",
};

const CHAIN_LABELS: Record<ChainId, string> = {
  stellar: "Stellar",
  evm: "EVM",
  solana: "Solana",
  cosmos: "Cosmos",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function ChainBadge({ chain }: { chain: ChainId }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CHAIN_COLORS[chain]}`}
    >
      {CHAIN_LABELS[chain]}
    </span>
  );
}

function ChainToggleRow({
  apiKey,
  serverUrl,
  adminToken,
  onUpdate,
}: {
  apiKey: ApiKey;
  serverUrl: string;
  adminToken: string;
  onUpdate: (id: string, chains: ChainId[]) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function toggle(chain: ChainId) {
    const current = apiKey.allowedChains ?? ["stellar"];
    const next = current.includes(chain)
      ? current.filter((c) => c !== chain)
      : [...current, chain];

    // Must keep at least one chain
    if (next.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch(
        `${serverUrl}/admin/api-keys/${apiKey.id}/chains`,
        {
          method: "PATCH",
          headers: {
            "x-admin-token": adminToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ allowedChains: next }),
        },
      );
      if (res.ok) {
        onUpdate(apiKey.id, next);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {ALL_CHAINS.map((chain) => {
        const active = (apiKey.allowedChains ?? ["stellar"]).includes(chain);
        return (
          <button
            key={chain}
            type="button"
            disabled={saving || !apiKey.active}
            onClick={() => toggle(chain)}
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition ${
              active
                ? CHAIN_COLORS[chain]
                : "bg-slate-50 text-slate-400 ring-slate-200 opacity-50"
            } ${apiKey.active ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed"}`}
            title={active ? `Disable ${CHAIN_LABELS[chain]}` : `Enable ${CHAIN_LABELS[chain]}`}
          >
            {CHAIN_LABELS[chain]}
          </button>
        );
      })}
    </div>
  );
}

export function ApiKeysTable({
  initialKeys,
  serverUrl,
  adminToken,
}: ApiKeysTableProps) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function handleRevoke() {
    if (!pendingRevoke) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await fetch(`${serverUrl}/admin/api-keys/${pendingRevoke.id}/revoke`, {
        method: "PATCH",
        headers: {
          "x-admin-token": adminToken,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      setKeys((prev) =>
        prev.map((k: ApiKey) => (k.id === pendingRevoke.id ? { ...k, active: false } : k)),
      );
      setPendingRevoke(null);
    } catch (err: unknown) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke key. Please try again.");
    } finally {
      setRevoking(false);
    }
  }

  function closeRevokeDialog() {
    if (!revoking) {
      setPendingRevoke(null);
      setRevokeError(null);
    }
  }

  function handleChainUpdate(keyId: string, chains: ChainId[]) {
    setKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, allowedChains: chains } : k)),
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">API Keys</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage keys and per-chain permissions. Click chain badges to toggle access.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Key
                </th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 sm:table-cell">
                  Tenant
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Chains
                </th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 md:table-cell">
                  Created
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {keys.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm text-slate-400"
                  >
                    No API keys found.
                  </td>
                </tr>
              )}
              {keys.map((apiKey: ApiKey) => (
                <tr
                  key={apiKey.id}
                  className={
                    apiKey.active
                      ? "transition hover:bg-slate-50"
                      : "bg-slate-50 opacity-60"
                  }
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-sm ${
                          apiKey.active
                            ? "text-slate-900"
                            : "text-slate-400 line-through"
                        }`}
                      >
                        {apiKey.key}
                      </span>
                      {apiKey.active && (
                        <CopyButton
                          value={apiKey.key}
                          label="Copy"
                          size="sm"
                          iconOnly
                        />
                      )}
                    </div>
                  </td>

                  <td className="hidden px-5 py-4 text-sm text-slate-600 sm:table-cell">
                    {apiKey.tenantId}
                  </td>

                  <td className="px-5 py-4">
                    <ChainToggleRow
                      apiKey={apiKey}
                      serverUrl={serverUrl}
                      adminToken={adminToken}
                      onUpdate={handleChainUpdate}
                    />
                  </td>

                  <td className="hidden px-5 py-4 text-sm text-slate-500 md:table-cell">
                    {formatDate(apiKey.createdAt)}
                  </td>

                  <td className="px-5 py-4">
                    {apiKey.active ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold capitalize text-rose-700 ring-1 ring-inset ring-rose-200">
                        Revoked
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-4 text-right">
                    {apiKey.active ? (
                      <button
                        type="button"
                        onClick={() => setPendingRevoke(apiKey)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                        aria-label={`Revoke API key ${apiKey.key}`}
                      >
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                        Revoke
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => { if (!open) closeRevokeDialog(); }}
        title="Revoke API Key"
        description={
          pendingRevoke
            ? `This will immediately deactivate ${pendingRevoke.key}. Any dApp or service using this key will lose access instantly. This action cannot be undone.`
            : ""
        }
        confirmLabel={revoking ? "Revoking…" : "Revoke Key"}
        cancelLabel="Cancel"
        onConfirm={() => void handleRevoke()}
        onCancel={closeRevokeDialog}
        variant="destructive"
        isLoading={revoking}
      />
      {revokeError && (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {revokeError}
        </div>
      )}
    </>
  );
}
