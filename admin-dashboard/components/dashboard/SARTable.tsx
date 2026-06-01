"use client";

import { useState } from "react";
import type { SARPageData, SARReport, SARStatus } from "@/lib/sar-data";
import { CopyButton } from "@/components/dashboard/CopyButton";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortenHash(value: string) {
  if (!value) return "—";
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function SARStatusBadge({ status }: { status: SARStatus }) {
  const classes: Record<SARStatus, string> = {
    pending_review: "bg-amber-50 text-amber-700 ring-amber-200",
    confirmed_suspicious: "bg-rose-50 text-rose-700 ring-rose-200",
    false_positive: "bg-emerald-50 text-emerald-700 ring-emerald-200"
  };
  const labels: Record<SARStatus, string> = {
    pending_review: "Pending Review",
    confirmed_suspicious: "Confirmed Suspicious",
    false_positive: "False Positive"
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

function RuleCodeBadge({ code }: { code: string }) {
  const labels: Record<string, string> = {
    HIGH_FREQUENCY: "High Frequency",
    HIGH_SOROBAN_FEE: "High Soroban Fee",
    LARGE_FEE_BUMP: "Large Fee Bump"
  };
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200 ring-inset">
      {labels[code] ?? code}
    </span>
  );
}

interface ReviewDialogProps {
  report: SARReport;
  onClose: () => void;
  onSubmit: (id: string, status: "confirmed_suspicious" | "false_positive", note: string) => void;
  submitting: boolean;
}

function ReviewDialog({ report, onClose, onSubmit, submitting }: ReviewDialogProps) {
  const [decision, setDecision] = useState<"confirmed_suspicious" | "false_positive">("false_positive");
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Review SAR Report</h2>
          <p className="mt-1 text-sm text-slate-500">{report.reason}</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Decision</p>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="confirmed_suspicious"
                  checked={decision === "confirmed_suspicious"}
                  onChange={() => setDecision("confirmed_suspicious")}
                  className="text-rose-600"
                />
                <span className="text-sm font-medium text-slate-800">Confirmed Suspicious</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="false_positive"
                  checked={decision === "false_positive"}
                  onChange={() => setDecision("false_positive")}
                  className="text-emerald-600"
                />
                <span className="text-sm font-medium text-slate-800">False Positive</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
              Admin Note (optional)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Add context for this decision..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>
        <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(report.id, decision, note)}
            disabled={submitting}
            className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Submit Review"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SARTableProps {
  data: SARPageData;
}

export function SARTable({ data }: SARTableProps) {
  const [reports, setReports] = useState<SARReport[]>(data.reports);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [reviewing, setReviewing] = useState<SARReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = activeFilter === "all"
    ? reports
    : reports.filter(r => r.status === activeFilter);

  const filters: Array<{ key: string; label: string; count: number }> = [
    { key: "all", label: "All", count: reports.length },
    { key: "pending_review", label: "Pending Review", count: data.stats.summary.pending },
    { key: "confirmed_suspicious", label: "Confirmed", count: data.stats.summary.confirmed },
    { key: "false_positive", label: "False Positive", count: data.stats.summary.falsePositive }
  ];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleReview(
    id: string,
    status: "confirmed_suspicious" | "false_positive",
    adminNote: string
  ) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sar/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote })
      });
      if (!res.ok) throw new Error("Failed to submit review");

      setReports(prev =>
        prev.map(r =>
          r.id === id
            ? { ...r, status, adminNote, reviewedBy: "admin", reviewedAt: new Date().toISOString() }
            : r
        )
      );
      setReviewing(null);
      showToast(status === "confirmed_suspicious" ? "Marked as confirmed suspicious." : "Marked as false positive.");
    } catch {
      showToast("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport() {
    const params = new URLSearchParams();
    if (activeFilter !== "all") params.set("status", activeFilter);
    window.location.href = `/api/sar/export?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/50 glass px-5 py-4 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">Pending Review</p>
          <p className="mt-1 text-3xl font-black text-amber-500 tracking-tight">{data.stats.summary.pending}</p>
        </div>
        <div className="rounded-xl border border-border/50 glass px-5 py-4 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">Confirmed Suspicious</p>
          <p className="mt-1 text-3xl font-black text-rose-500 tracking-tight">{data.stats.summary.confirmed}</p>
        </div>
        <div className="rounded-xl border border-border/50 glass px-5 py-4 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">Last 24 Hours</p>
          <p className="mt-1 text-3xl font-black text-foreground tracking-tight">{data.stats.summary.last24Hours}</p>
        </div>
        <div className="rounded-xl border border-border/50 glass px-5 py-4 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">Last 7 Days</p>
          <p className="mt-1 text-3xl font-black text-foreground tracking-tight">{data.stats.summary.last7Days}</p>
        </div>
      </div>


      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                activeFilter === f.key
                  ? "bg-sky-600 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 rounded-full px-1.5 text-xs ${
                activeFilter === f.key ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>


      <div className="overflow-hidden rounded-3xl border border-border/50 glass shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No SAR reports match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Flagged At</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Tx Hash</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Rule</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(report => (
                  <tr key={report.id} className="hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(report.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-slate-700">
                          {shortenHash(report.txHash)}
                        </span>
                        {report.txHash && (
                          <CopyButton
                            value={report.txHash}
                            label="Copy hash"
                            size="sm"
                            iconOnly
                          />
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                      {report.tenantName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <RuleCodeBadge code={report.ruleCode} />
                    </td>
                    <td className="max-w-xs px-4 py-3 text-sm text-slate-600">
                      <span className="line-clamp-2">{report.reason}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <SARStatusBadge status={report.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {report.status === "pending_review" ? (
                        <button
                          onClick={() => setReviewing(report)}
                          className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                        >
                          Review
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {report.reviewedBy ? `by ${report.reviewedBy}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {reviewing && (
        <ReviewDialog
          report={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={handleReview}
          submitting={submitting}
        />
      )}


      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {data.source === "sample" && (
        <p className="text-center text-xs text-slate-400">
          Showing sample data. Connect your server to see live SAR reports.
        </p>
      )}
    </div>
  );
}
