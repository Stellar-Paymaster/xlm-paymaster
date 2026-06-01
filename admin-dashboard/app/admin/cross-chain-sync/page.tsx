"use client";

import { useEffect, useState } from "react";
import { 
  ArrowRightLeft, 
  RefreshCcw, 
  CheckCircle2, 
  ExternalLink, 
  Activity,
  Zap,
  Globe,
  Database
} from "lucide-react";
import { fluidAdminToken, fluidServerUrl } from "@/lib/server-env";

interface SyncEvent {
  id: string;
  sourceChain: string;
  targetChain: string;
  sourceTxHash: string;
  targetTxHash?: string;
  sourceContract: string;
  targetContract: string;
  payload: string;
  status: string;
  createdAt: string;
}

interface SyncStatus {
  stellarCount: number;
  evmCount: number;
  lastSyncAt: string | null;
}

export default function CrossChainSyncPage() {
  const [history, setHistory] = useState<SyncEvent[]>([]);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    try {
      const historyRes = await fetch(`${fluidServerUrl}/admin/cross-chain-sync/history`, {
        headers: { "Authorization": `Bearer ${fluidAdminToken}` }
      });
      const historyData = await historyRes.json();
      setHistory(historyData.history || []);

      const statusRes = await fetch(`${fluidServerUrl}/admin/cross-chain-sync/status`, {
        headers: { "Authorization": `Bearer ${fluidAdminToken}` }
      });
      const statusData = await statusRes.json();
      setStatus(statusData);
    } catch (error) {
      console.error("Failed to fetch sync data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleIncrement = async (chain: "stellar" | "evm") => {
    setSyncing(true);
    try {
      const endpoint = chain === "stellar" ? "increment-stellar" : "increment-evm";
      await fetch(`${fluidServerUrl}/admin/cross-chain-sync/${endpoint}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${fluidAdminToken}` }
      });
      await fetchData();
    } catch (error) {
      console.error(`Failed to increment ${chain}:`, error);
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 bg-slate-50">
        <RefreshCcw className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 sm:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-600 p-2 text-white">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Cross-Chain State Sync</h1>
              <p className="text-slate-500 mt-1">Stellar Soroban ↔ EVM Sepolia Proof-of-Concept</p>
            </div>
          </div>
        </header>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-600 bg-sky-50 px-3 py-1 rounded-full">Stellar Soroban</span>
              <Globe className="h-5 w-5 text-slate-400" />
            </div>
            <div className="text-5xl font-extrabold text-slate-900 mb-6">{status?.stellarCount || 0}</div>
            <button 
              onClick={() => handleIncrement("stellar")}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white rounded-2xl py-4 font-bold text-sm transition-all hover:bg-slate-800 disabled:opacity-50 group shadow-lg shadow-slate-200"
            >
              <Zap className="h-4 w-4 fill-amber-400 text-amber-400 transition-transform group-hover:scale-125" />
              Increment Soroban
            </button>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">EVM Sepolia</span>
              <Activity className="h-5 w-5 text-slate-400" />
            </div>
            <div className="text-5xl font-extrabold text-slate-900 mb-6">{status?.evmCount || 0}</div>
            <button 
              onClick={() => handleIncrement("evm")}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white rounded-2xl py-4 font-bold text-sm transition-all hover:bg-slate-800 disabled:opacity-50 group shadow-lg shadow-slate-200"
            >
              <Zap className="h-4 w-4 fill-amber-400 text-amber-400 transition-transform group-hover:scale-125" />
              Increment EVM
            </button>
          </div>

          <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
            <div className="relative z-10">
              <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                Relayer Active
              </h2>
              <p className="text-slate-400 text-sm mb-6">Monitoring sub-second events across chains to maintain state parity.</p>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2">
                  <span className="text-slate-400">Sync Pipeline</span>
                  <span className="font-mono text-emerald-400">READY</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2">
                  <span className="text-slate-400">Last Block Sync</span>
                  <span className="font-mono">{status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString() : 'N/A'}</span>
                </div>
              </div>
            </div>
            {/* Background design element */}
            <div className="absolute -bottom-10 -right-10 h-40 w-40 bg-sky-500/10 rounded-full blur-3xl"></div>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Database className="h-5 w-5 text-slate-400" />
              Sync History
            </h3>
            <span className="text-xs uppercase font-bold tracking-widest text-slate-400">{history.length} Event(s) Recorded</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-400 text-xs font-bold uppercase tracking-widest bg-slate-50">
                  <th className="px-8 py-4">Source</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Detail</th>
                  <th className="px-8 py-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${event.sourceChain === 'stellar' ? 'bg-sky-500' : 'bg-indigo-500'}`}></div>
                        <span className="font-bold text-slate-900 capitalize text-sm">{event.sourceChain}</span>
                        <ArrowRightLeft className="h-3 w-3 text-slate-400 group-hover:text-sky-600 transition-colors" />
                        <span className="font-bold text-slate-900 capitalize text-sm">{event.targetChain}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        event.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {event.status}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                          <span className="w-12 truncate">Src:</span>
                          <span className="text-slate-600 truncate max-w-[100px]">{event.sourceTxHash}</span>
                          <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-sky-600" />
                        </div>
                        {event.targetTxHash && (
                          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                            <span className="w-12 truncate">Tgt:</span>
                            <span className="text-sky-600 truncate max-w-[100px]">{event.targetTxHash}</span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-sky-600" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right font-mono text-xs text-slate-400">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-10 text-center text-slate-400 italic">No sync events recorded yet. Trigger an increment above to see the relayer in action.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
