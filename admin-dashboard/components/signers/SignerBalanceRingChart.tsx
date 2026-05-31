"use client";

import React from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { ManagedSigner } from "@/lib/signer-management";

interface SignerBalanceRingChartProps {
  signers: ManagedSigner[];
}

interface ChartSlice {
  name: string;
  value: number;
  balance: number;
  publicKey: string;
  color: string;
}

const COLORS = ["#0f172a", "#0ea5e9", "#14b8a6", "#f97316", "#8b5cf6", "#ef4444"];

function parseBalance(value: string): number {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function formatBalance(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM`;
}

function shortKey(publicKey: string): string {
  if (publicKey.length <= 16) {
    return publicKey;
  }

  return `${publicKey.slice(0, 6)}…${publicKey.slice(-6)}`;
}

function buildChartSlices(signers: ManagedSigner[]): ChartSlice[] {
  const activeSigners = signers.filter((signer) => signer.status === "Active");
  const slices = activeSigners
    .map((signer) => ({
      name: shortKey(signer.publicKey),
      value: Math.max(parseBalance(signer.balance), 0),
      balance: Math.max(parseBalance(signer.balance), 0),
      publicKey: signer.publicKey,
      color: COLORS[0],
    }))
    .filter((slice) => slice.value > 0);

  const totalBalance = slices.reduce((sum, slice) => sum + slice.balance, 0);

  return slices.map((slice, index) => ({
    ...slice,
    value: totalBalance > 0 ? slice.balance : 0,
    color: COLORS[index % COLORS.length],
  }));
}

function BalanceTooltip({
  active,
  payload,
  totalBalance,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartSlice }>;
  totalBalance: number;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const slice = payload[0].payload;
  const share = totalBalance > 0 ? (slice.balance / totalBalance) * 100 : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-900">{slice.name}</p>
      <p className="mt-1 text-sm text-slate-600">{formatBalance(slice.balance)}</p>
      <p className="text-xs text-slate-500">{share.toFixed(1)}% of active pool</p>
    </div>
  );
}

function BalanceLegend({
  payload,
  totalBalance,
}: {
  payload?: Array<{
    value?: string;
    color?: string;
    payload?: ChartSlice;
  }>;
  totalBalance: number;
}) {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {payload.map((entry) => {
        const slice = entry.payload;
        if (!slice) {
          return null;
        }

        const share = totalBalance > 0 ? (slice.balance / totalBalance) * 100 : 0;

        return (
          <div key={slice.publicKey} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{slice.name}</p>
              <p className="text-xs text-slate-500">
                {formatBalance(slice.balance)} · {share.toFixed(1)}%
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SignerBalanceRingChart({ signers }: SignerBalanceRingChartProps) {
  const chartSlices = buildChartSlices(signers);
  const totalBalance = chartSlices.reduce((sum, slice) => sum + slice.balance, 0);
  const activeSigners = signers.filter((signer) => signer.status === "Active");

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
            Balance Allocation
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Signer Pool Ring Chart</h2>
          <p className="mt-1 text-sm text-slate-600">
            Active signer balances are normalized to show how funds are distributed across the pool.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div className="font-semibold text-slate-950">{activeSigners.length} active signer{activeSigners.length === 1 ? "" : "s"}</div>
          <div>{formatBalance(totalBalance)} total active balance</div>
        </div>
      </div>

      {chartSlices.length > 0 ? (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartSlices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="92%"
                  paddingAngle={3}
                  stroke="white"
                  strokeWidth={2}
                >
                  {chartSlices.map((slice) => (
                    <Cell key={slice.publicKey} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<BalanceTooltip totalBalance={totalBalance} />} />
                <Legend content={<BalanceLegend totalBalance={totalBalance} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3 rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Pool summary</p>
            <dl className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Active signers</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-950">{activeSigners.length}</dd>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Total balance</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-950">{formatBalance(totalBalance)}</dd>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Average balance</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-950">
                  {activeSigners.length > 0 ? formatBalance(totalBalance / activeSigners.length) : "0 XLM"}
                </dd>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Inactive signers</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-950">
                  {signers.length - activeSigners.length}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
          No active signer balances are available yet.
        </div>
      )}
    </section>
  );
}
