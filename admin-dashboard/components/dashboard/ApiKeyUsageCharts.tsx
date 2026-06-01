"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ApiKeyUsageStat } from "@/lib/api-key-usage-data";

interface ApiKeyUsageChartsProps {
  stats: ApiKeyUsageStat[];
}

const CHART_MARGIN = { top: 5, right: 12, left: 0, bottom: 5 };

const TOOLTIP_STYLE = {
  borderRadius: "0.5rem",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: "12px",
};

const TICK_STYLE = { fontSize: 11, fill: "var(--muted-foreground)" };

export function ApiKeyUsageCharts({ stats }: ApiKeyUsageChartsProps) {
  if (stats.length === 0) {
    return (
      <div className="rounded-3xl border border-border/50 bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        No usage data available for the current key set.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Requests per key */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm">
        <div className="border-b border-border/50 px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Requests per Key</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Successful and failed request counts broken down by API key.
          </p>
        </div>
        <div className="p-5">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={TICK_STYLE} />
              <YAxis tick={TICK_STYLE} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="successCount" name="Success" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failedCount" name="Failed" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Failure rate */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm">
        <div className="border-b border-border/50 px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Failure Rate (%)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Percentage of requests that failed per key. Elevated rates may signal abuse or mis-configuration.
          </p>
        </div>
        <div className="p-5">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={TICK_STYLE} />
              <YAxis
                tick={TICK_STYLE}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, "Failure rate"]}
                contentStyle={TOOLTIP_STYLE}
              />
              <Bar
                dataKey="failureRatePct"
                name="Failure rate"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost per key */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm">
        <div className="border-b border-border/50 px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Cost per Key (stroops)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimated network fee cost attributed to each API key based on sponsored transactions.
          </p>
        </div>
        <div className="p-5">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={TICK_STYLE} />
              <YAxis tick={TICK_STYLE} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar
                dataKey="totalCostStroops"
                name="Cost (stroops)"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
