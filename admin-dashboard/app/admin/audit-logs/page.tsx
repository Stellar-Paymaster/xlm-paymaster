"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getAuditLogsData, type AuditLogEntry, type AuditLogPageData } from "@/lib/audit-logs-data";
import { buildAuditTrailSnapshot } from "@/lib/audit-trail-snapshots";

function AiSummaryTooltip({ summary }: { summary: string }) {
  return (
    <span className="group relative cursor-help">
      <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
        AI
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {summary}
      </span>
    </span>
  );
}

function SnapshotPopover({ entry, baseline }: { entry: AuditLogEntry; baseline: AuditLogEntry | null }) {
  const [open, setOpen] = useState(false);
  const snapshot = useMemo(() => buildAuditTrailSnapshot(entry, baseline), [entry, baseline]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        What changed
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-90 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit Trail Snapshot</p>
          <p className="mt-1 text-xs text-slate-700">{snapshot.summary}</p>
          {snapshot.hasChanges ? (
            <ul className="mt-2 space-y-2 text-xs">
              {snapshot.changes.map((change) => (
                <li key={change.field} className="rounded-md bg-slate-50 p-2">
                  <p className="font-semibold text-slate-700">{change.field}</p>
                  <p className="text-slate-500">Before: {change.before}</p>
                  <p className="text-slate-700">After: {change.after}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No metadata diff available.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AuditLogRow({ entry, baseline }: { entry: AuditLogEntry; baseline: AuditLogEntry | null }) {
  const time = new Date(entry.createdAt).toLocaleString();

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition">
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{time}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
          {entry.action}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">{entry.actor}</td>
      <td className="max-w-40 truncate px-4 py-3 font-mono text-sm text-slate-500">
        {entry.target ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm">
        {entry.aiSummary ? (
          <div className="flex items-center gap-2">
            <AiSummaryTooltip summary={entry.aiSummary} />
            <span className="max-w-65 truncate text-slate-600">{entry.aiSummary}</span>
          </div>
        ) : (
          <span className="text-slate-400 italic text-xs">pending…</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <SnapshotPopover entry={entry} baseline={baseline} />
      </td>
    </tr>
  );
}

export default function AdminAuditLogsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<AuditLogPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    setLoading(true);
    getAuditLogsData(limit, offset).then(setData).finally(() => setLoading(false));
  }, [offset]);

  const hasPrev = offset > 0;
  const hasNext = data ? offset + limit < data.total : false;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
                Fluid Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Audit Logs</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Track admin and system actions with AI-generated summaries.
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
          <p className="text-center py-12 text-red-600">Failed to load audit logs</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">AI Summary</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                      No audit logs yet
                    </td>
                  </tr>
                ) : (
                  data.items.map((entry, index) => (
                    <AuditLogRow
                      key={entry.id}
                      entry={entry}
                      baseline={data.items[index + 1] ?? null}
                    />
                  ))
                )}
              </tbody>
            </table>

            {data.total > limit && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                <span>
                  Showing {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={!hasPrev}
                    onClick={() => setOffset((o) => Math.max(0, o - limit))}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={!hasNext}
                    onClick={() => setOffset((o) => o + limit)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
