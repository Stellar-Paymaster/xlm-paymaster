"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UsageSummary {
  month: { txCount: number; xlmSponsored: number };
  day: {
    txCount: number;
    stroopsUsed: number;
    quotaStroops: number;
    txLimit: number;
    remainingTx: number;
    remainingStroops: number;
    resetsUtcDaily: boolean;
  };
  quotaWarning: boolean;
  apiKey: { name: string; lastUsedAt: string | null };
}

interface ChartPayload {
  days: number;
  series: Array<{ date: string; txCount: number; feeStroops: number }>;
}

interface TxRow {
  id: string;
  hash: string;
  status: string;
  costStroops: number;
  category: string;
  createdAt: string;
}

function formatDay(value: string): string {
  const d = new Date(`${value}T12:00:00.000Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncateHash(hash: string, left = 6, right = 4): string {
  if (hash.length <= left + right + 1) return hash;
  return `${hash.slice(0, left)}…${hash.slice(-right)}`;
}

export function TenantUsageDashboard() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [chart, setChart] = useState<ChartPayload | null>(null);
  const [txList, setTxList] = useState<TxRow[] | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setSummary(null);
    setChart(null);
    setTxList(null);

    try {
      const res = await fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Request failed."
        );
        return;
      }

      setSummary(data.summary as UsageSummary);
      setChart(data.chart as ChartPayload);
      const txs = (data.transactions as { transactions?: TxRow[] })
        ?.transactions;
      setTxList(Array.isArray(txs) ? txs : []);
    } catch {
      setError("Network error. Check that the app can reach the Fluid server.");
    } finally {
      setLoading(false);
    }
  }

  const chartData =
    chart?.series.map((p) => ({
      ...p,
      xlmDay: p.feeStroops / 10_000_000,
    })) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Usage dashboard</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          View API consumption for your tenant: monthly sponsored volume,
          remaining daily quota (UTC), and recent transactions. Your key is sent
          to this site&apos;s server once per refresh and is not stored.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="mb-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-2">
          <label htmlFor="usage-api-key" className="text-sm font-medium">
            API key
          </label>
          <Input
            id="usage-api-key"
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder="fluid_…"
            value={apiKeyInput}
            onChange={(ev) => setApiKeyInput(ev.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <Button type="submit" disabled={loading || !apiKeyInput.trim()}>
          {loading ? "Loading…" : "Load usage"}
        </Button>
      </form>

      {error ? (
        <div
          className="mb-8 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {summary ? (
        <>
          {summary.quotaWarning ? (
            <div
              className="mb-8 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
              role="status"
            >
              <strong className="font-semibold">Approaching daily quota.</strong>{" "}
              You have used at least 80% of today&apos;s transaction limit or
              sponsored stroops budget (UTC day). Plan capacity or contact
              support if you need a higher tier.
            </div>
          ) : null}

          <dl className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Month transactions
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.month.txCount.toLocaleString()}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                XLM sponsored (month)
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.month.xlmSponsored.toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Remaining today (UTC)
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {summary.day.remainingTx} tx ·{" "}
                {(summary.day.remainingStroops / 10_000_000).toLocaleString(
                  undefined,
                  { maximumFractionDigits: 7 }
                )}{" "}
                XLM
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                Daily cap: {summary.day.txLimit} tx,{" "}
                {(summary.day.quotaStroops / 10_000_000).toLocaleString(
                  undefined,
                  { maximumFractionDigits: 4 }
                )}{" "}
                XLM
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Key last used
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {summary.apiKey.lastUsedAt
                  ? new Date(summary.apiKey.lastUsedAt).toLocaleString()
                  : "—"}
              </dd>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {summary.apiKey.name}
              </p>
            </div>
          </dl>

          <div className="mb-10 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">
              Last 30 days (sponsored activity)
            </h2>
            <div className="h-56 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDay}
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    width={48}
                    className="text-muted-foreground"
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip
                    formatter={(value: number | string) => [
                      typeof value === "number" ? value.toFixed(6) : String(value),
                      "XLM / day",
                    ]}
                    labelFormatter={(label) => formatDay(String(label))}
                  />
                  <Line
                    type="monotone"
                    dataKey="xlmDay"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <h2 className="border-b border-border px-4 py-3 text-lg font-semibold">
              Recent transactions
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Cost (XLM)</th>
                    <th className="px-4 py-2 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {(txList ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No transactions yet for this tenant.
                      </td>
                    </tr>
                  ) : (
                    (txList ?? []).map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/80 last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 capitalize">{row.status}</td>
                        <td className="px-4 py-2">{row.category}</td>
                        <td className="px-4 py-2 font-mono text-xs tabular-nums">
                          {(row.costStroops / 10_000_000).toLocaleString(
                            undefined,
                            { maximumFractionDigits: 7 }
                          )}
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-2 font-mono text-xs">
                          {truncateHash(row.hash)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
