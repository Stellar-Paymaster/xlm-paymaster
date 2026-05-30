import Link from "next/link";
import { auth } from "@/auth";
import { ChainRegistryManager } from "@/components/chains/ChainRegistryManager";
import type { ChainRecord } from "@/components/chains/ChainRegistryManager";
import { HorizonLatencyGrid } from "@/components/dashboard/HorizonLatencyGrid";
import { getHorizonLatencyGridData } from "@/lib/horizon-monitor";

async function fetchChains(): Promise<ChainRecord[]> {
  const serverUrl = process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.FLUID_ADMIN_TOKEN?.trim();

  if (!serverUrl || !adminToken) {
    return [];
  }

  try {
    const res = await fetch(`${serverUrl}/admin/chains`, {
      cache: "no-store",
      headers: { "x-admin-token": adminToken },
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.chains ?? []) as ChainRecord[];
  } catch {
    return [];
  }
}

export default async function AdminChainsPage() {
  const session = await auth();
  const [chains, horizonHealth] = await Promise.all([
    fetchChains(),
    getHorizonLatencyGridData(),
  ]);

  return (
    <main className="min-h-screen bg-slate-100">
      {/* ── Page header ── */}
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
                Fluid Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">
                Chain Registry
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Add, configure, and enable or disable supported Stellar networks without
                redeploying the server. RPC URL reachability is validated before a
                chain can be enabled.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="font-medium text-slate-900">
                  {session?.user?.email}
                </div>
                <div>{chains.length} chain{chains.length !== 1 ? "s" : ""} registered</div>
              </div>
              <Link
                href="/admin/dashboard"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <HorizonLatencyGrid endpoints={horizonHealth} />
        <ChainRegistryManager chains={chains} />
      </div>
    </main>
  );
}
