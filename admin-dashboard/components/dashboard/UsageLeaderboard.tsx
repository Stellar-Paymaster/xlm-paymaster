"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { TenantUsageRow } from "@/components/dashboard/types";
import { exportLeaderboardToCSV, exportLeaderboardToPDF } from "@/lib/export-leaderboard";

interface UsageLeaderboardProps {
  rows: TenantUsageRow[];
  sortBy?: "cost" | "txCount";
  transactionsBasePath?: string;
}

const BAR_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
];

function formatStroops(stroops: number): string {
  if (stroops >= 10_000_000) {
    return `${(stroops / 10_000_000).toFixed(2)} XLM`;
  }
  return `${stroops.toLocaleString()} stroops`;
}

function ExportMenu({ rows }: { rows: TenantUsageRow[] }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleExport(format: "csv" | "pdf") {
    setExporting(format);
    try {
      if (format === "csv") {
        exportLeaderboardToCSV(rows);
      } else {
        await exportLeaderboardToPDF(rows);
      }
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Export leaderboard"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
      </button>

      {open && (
        <div
          className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-border/70 bg-card py-1 shadow-lg"
          role="menu"
        >
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => handleExport("csv")}
            role="menuitem"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-emerald-600"
              aria-hidden="true"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="16" y2="17" />
            </svg>
            {exporting === "csv" ? "Exporting…" : "Export as CSV"}
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => handleExport("pdf")}
            role="menuitem"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-red-500"
              aria-hidden="true"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {exporting === "pdf" ? "Exporting…" : "Export as PDF"}
          </button>
        </div>
      )}
    </div>
  );
}

export function UsageLeaderboard({
  rows,
  sortBy = "cost",
  transactionsBasePath = "/admin/transactions",
}: UsageLeaderboardProps) {
  const sorted = [...rows].sort((a, b) =>
    sortBy === "cost"
      ? b.totalCostStroops - a.totalCostStroops
      : b.txCount - a.txCount,
  );

  const maxCost = sorted[0]?.totalCostStroops ?? 1;
  const maxTx = sorted[0]?.txCount ?? 1;

  return (
    <div className="overflow-hidden rounded-3xl border border-border/50 glass  shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-foreground">
            Tenant Usage Ranking
          </h2>
          <p className="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Top performers by sponsorship volume
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
              XLM spend
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-muted shadow-inner" />
              Tx volume
            </span>
          </div>
          {rows.length > 0 && <ExportMenu rows={rows} />}
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {sorted.map((row, index) => {
          const costPct = Math.max(2, (row.totalCostStroops / maxCost) * 100);
          const txPct = Math.max(2, (row.txCount / maxTx) * 100);
          const barColor = BAR_COLORS[index % BAR_COLORS.length];
          const rank = index + 1;

          return (
            <li key={row.tenant} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                {/* Rank + name */}
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500"
                    aria-label={`Rank ${rank}`}
                  >
                    {rank}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`${transactionsBasePath}?q=${encodeURIComponent(row.tenant)}`}
                      className="truncate text-sm font-semibold text-slate-900 underline-offset-2 hover:text-sky-600 hover:underline"
                    >
                      {row.tenant}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>{row.txCount} txns</span>
                      <span
                        className={
                          row.failedCount > 0
                            ? "text-rose-500"
                            : "text-slate-400"
                        }
                      >
                        {row.failedCount} failed
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cost label */}
                <div className="shrink-0 text-right">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatStroops(row.totalCostStroops)}
                  </span>
                </div>
              </div>

              {/* Progress bars */}
              <div className="mt-3 space-y-1.5">
                {/* XLM cost bar */}
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label={`${row.tenant} XLM cost`}
                  aria-valuenow={row.totalCostStroops}
                  aria-valuemax={maxCost}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${costPct}%` }}
                  />
                </div>
                {/* Tx count bar */}
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label={`${row.tenant} transaction count`}
                  aria-valuenow={row.txCount}
                  aria-valuemax={maxTx}
                >
                  <div
                    className="h-full rounded-full bg-slate-300 transition-all duration-500"
                    style={{ width: `${txPct}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}

        {sorted.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-slate-400">
            No tenant data available.
          </li>
        )}
      </ul>

      {/* Footer */}
      <div className="border-t border-slate-100 px-5 py-3">
        <Link
          href={transactionsBasePath}
          className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline"
        >
          View full transaction history →
        </Link>
      </div>
    </div>
  );
}
