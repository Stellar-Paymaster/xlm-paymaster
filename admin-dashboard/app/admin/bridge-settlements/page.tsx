"use client";

import { useEffect, useState } from "react";
import { 
  ArrowRightLeft, 
  RefreshCcw, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  Database,
  Clock,
  RotateCcw,
  Check
} from "lucide-react";
import { fluidAdminToken, fluidServerUrl } from "@/lib/server-env";

interface Settlement {
  id: string;
  sourceChain: string;
  targetChain: string;
  sourceTxHash: string;
  targetTxHash?: string;
  amount: string;
  asset: string;
  status: string;
  timeoutAt: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export default function BridgeSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`${fluidServerUrl}/admin/bridge-settlements`, {
        headers: { "x-admin-token": fluidAdminToken }
      });
      const data = await res.json();
      setSettlements(data.settlements || []);
    } catch (error) {
      console.error("Failed to fetch settlements:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (id: string, status: string) => {
    if (!confirm(`Are you sure you want to mark this settlement as ${status}?`)) return;
    setActionLoading(id);
    try {
      await fetch(`${fluidServerUrl}/admin/bridge-settlements/${id}/resolve`, {
        method: "PATCH",
        headers: { 
          "x-admin-token": fluidAdminToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to resolve settlement:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefund = async (id: string) => {
    if (!confirm("Are you sure you want to refund this settlement?")) return;
    setActionLoading(id);
    try {
      await fetch(`${fluidServerUrl}/admin/bridge-settlements/${id}/refund`, {
        method: "POST",
        headers: { "x-admin-token": fluidAdminToken }
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to refund settlement:", error);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && settlements.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 bg-slate-50 min-h-screen">
        <RefreshCcw className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 sm:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-8 font-sans">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-2 text-white">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Bridge Settlements</h1>
              <p className="text-slate-500 mt-1 uppercase text-xs font-bold tracking-widest">Monitor and manage stalled transfers</p>
            </div>
          </div>
        </header>

        {/* List */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8 font-sans">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Database className="h-5 w-5 text-slate-400" />
              Settlement Records
            </h3>
            <span className="text-xs uppercase font-bold tracking-widest text-slate-400">{settlements.length} Record(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-widest bg-slate-50">
                  <th className="px-8 py-4">Assets & Route</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Timing</th>
                  <th className="px-8 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{(parseInt(s.amount) / 1000000).toFixed(2)} {s.asset}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                          <span>{s.sourceChain}</span>
                          <ArrowRightLeft className="h-3 w-3" />
                          <span>{s.targetChain}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]">
                          {s.sourceTxHash}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold w-fit ${
                          s.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 
                          s.status === 'STALLED' ? 'bg-rose-50 text-rose-700 animate-pulse' :
                          s.status === 'FAILED' ? 'bg-slate-100 text-slate-700' :
                          s.status === 'REFUNDED' ? 'bg-amber-50 text-amber-700' :
                          'bg-sky-50 text-sky-700'
                        }`}>
                          {s.status === 'COMPLETED' && <CheckCircle2 className="h-3 w-3" />}
                          {s.status === 'STALLED' && <AlertTriangle className="h-3 w-3" />}
                          {s.status === 'FAILED' && <XCircle className="h-3 w-3" />}
                          {s.status}
                        </span>
                        {s.error && <span className="text-[10px] text-rose-400 italic truncate max-w-[120px]">{s.error}</span>}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1 text-[10px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-300" />
                          <span> {new Date(s.createdAt).toLocaleString()}</span>
                        </div>
                        {s.status === 'PENDING' && (
                          <div className="flex items-center gap-1 text-rose-400 font-bold">
                            <Clock className="h-3 w-3" />
                            <span>Expires: {new Date(s.timeoutAt).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      {(s.status === 'STALLED' || s.status === 'FAILED') && (
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => handleResolve(s.id, 'COMPLETED')}
                            disabled={actionLoading === s.id}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all active:scale-95"
                            title="Resolve"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleRefund(s.id)}
                            disabled={actionLoading === s.id}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-95"
                            title="Refund"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {settlements.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-10 text-center text-slate-400 italic font-sans text-sm">No bridge settlements found.</td>
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
