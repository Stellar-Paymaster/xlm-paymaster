"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { ExpenseBreakdownData } from "@/lib/expense-breakdown-data";

interface ExpenseBreakdownProps {
  data: ExpenseBreakdownData;
}

const COLORS = {
  classic: "#0ea5e9", // Sky blue for Classic
  soroban: "#8b5cf6", // Purple for Soroban
};

function formatStroops(stroops: number): string {
  if (stroops >= 1_000_000_000) {
    return `${(stroops / 1_000_000_000).toFixed(2)}B`;
  }
  if (stroops >= 1_000_000) {
    return `${(stroops / 1_000_000).toFixed(2)}M`;
  }
  if (stroops >= 1_000) {
    return `${(stroops / 1_000).toFixed(1)}K`;
  }
  return stroops.toLocaleString();
}

interface ChartDataPoint {
  name: string;
  value: number;
  stroops: number;
  transactionCount: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartDataPoint;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
      <p className="font-semibold text-slate-900">{data.name}</p>
      <p className="mt-1 text-sm text-slate-600">
        <span className="font-medium">{formatStroops(data.stroops)}</span> stroops
      </p>
      <p className="text-sm text-slate-600">
        <span className="font-medium">{data.transactionCount}</span> transactions
      </p>
      <p className="text-sm text-slate-600">
        <span className="font-medium">{data.value.toFixed(1)}%</span> of total spend
      </p>
    </div>
  );
}

interface CustomLegendProps {
  payload?: Array<{
    value: string;
    color: string;
    payload: ChartDataPoint;
  }>;
}

function CustomLegend({ payload }: CustomLegendProps) {
  if (!payload) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-8">
      {payload.map((entry) => (
        <div key={entry.value} className="flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900">
              {entry.value}
            </span>
            <span className="text-xs text-slate-500">
              {formatStroops(entry.payload.stroops)} stroops
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExpenseBreakdown({ data }: ExpenseBreakdownProps) {
  const chartData: ChartDataPoint[] = [
    {
      name: "Classic",
      value: data.classic.percentage,
      stroops: data.classic.totalStroops,
      transactionCount: data.classic.transactionCount,
      color: COLORS.classic,
    },
    {
      name: "Soroban",
      value: data.soroban.percentage,
      stroops: data.soroban.totalStroops,
      transactionCount: data.soroban.transactionCount,
      color: COLORS.soroban,
    },
  ];

  const hasData = data.totalStroops > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
          Cost Breakdown
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">
          Soroban vs Classic Expenditure
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Distribution of XLM spend between traditional Stellar operations and
          Soroban smart contracts
        </p>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke="white"
                  strokeWidth={2}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-70 items-center justify-center">
          <p className="text-sm text-slate-500">No transaction data available</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-sky-600">
            {formatStroops(data.classic.totalStroops)}
          </p>
          <p className="text-xs text-slate-500">Classic Stroops</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-violet-600">
            {formatStroops(data.soroban.totalStroops)}
          </p>
          <p className="text-xs text-slate-500">Soroban Stroops</p>
        </div>
      </div>
    </div>
  );
}