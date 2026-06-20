"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getCosmosFeegrantData, type CosmosGranter, type CosmosFeegrantPageData } from "@/lib/cosmos-feegrant-data";

function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
      Enabled
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
      Disabled
    </span>
  );
}

function GranterRow({ granter }: { granter: CosmosGranter }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition">
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-slate-900">{granter.name}</div>
        <div className="text-xs text-slate-500">{granter.chainId}</div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge enabled={granter.enabled} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 font-mono truncate max-w-[200px]">
        {granter.granterAddress ?? <span className="text-slate-400 italic">not set</span>}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
          {granter.prefix}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">{granter.denom}</td>
      <td className="px-4 py-3 text-sm text-slate-500 truncate max-w-[240px]">{granter.rpcUrl}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${granter.hasMnemonic ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {granter.hasMnemonic ? "Yes" : "No"}
        </span>
      </td>
    </tr>
  );
}

export default function CosmosFeegrantPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<CosmosFeegrantPageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCosmosFeegrantData().then(setData).finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
                Paymaster Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Cosmos FeeGrant</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Manage fee granter wallets and allowances across Cosmos IBC chains.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="font-medium text-slate-900">{session?.user?.email}</div>
                <div>{data?.source === "live" ? "Live server data" : "Sample data"}</div>
              </div>
              <Link
                href="/admin/dashboard"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-64 bg-slate-200 rounded-xl" />
          </div>
        ) : !data ? (
          <p className="text-center py-12 text-red-600">Failed to load granter data</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Chain</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Granter Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Prefix</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Denom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">RPC URL</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Key</th>
                </tr>
              </thead>
              <tbody>
                {data.granters.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                      No Cosmos granters configured yet
                    </td>
                  </tr>
                ) : (
                  data.granters.map((g) => <GranterRow key={g.id} granter={g} />)
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
