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
import type { Chain, ChainTreasuryBalance, MultiChainData } from "@/lib/multi-chain-data";

const CHAIN_CONFIG: Record<Chain, { label: string; color: string }> = {
  stellar: { label: "Stellar", color: "#0ea5e9" },
  evm: { label: "EVM", color: "#8b5cf6" },
  solana: { label: "Solana", color: "#14b8a6" },
  cosmos: { label: "Cosmos", color: "#f59e0b" },
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNative(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: 4,
  });
}

function TreasuryCard({ chain }: { chain: ChainTreasuryBalance }) {
  const cfg = CHAIN_CONFIG[chain.chain];

  return (
    <div className="rounded-xl border border-border/50 glass  p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
        <span className="text-sm font-semibold text-slate-900">{cfg.label}</span>
        {!chain.configured && (
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            Not configured
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">Native Balance</p>
          <p className="text-sm font-semibold text-slate-900">
            {formatNative(chain.nativeBalance)} {chain.unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">USD Value</p>
          <p className="text-sm font-semibold text-slate-900">{formatUsd(chain.usdValue)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Signing Accounts</p>
          <p className="text-lg font-bold text-slate-900">{chain.accountCount}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <p className={`text-sm font-semibold ${chain.error ? "text-rose-600" : "text-emerald-600"}`}>
            {chain.error ? "Partial error" : "Healthy"}
          </p>
        </div>
      </div>
      {chain.error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {chain.error}
        </p>
      )}
    </div>
  );
}

function TreasuryChart({ data }: { data: MultiChainData }) {
  const maxAccounts = Math.max(1, ...data.chains.map((chain) => chain.accounts.length));
  const chartData = data.chains.map((chain) => {
    const point: Record<string, string | number> = {
      chain: CHAIN_CONFIG[chain.chain].label,
      totalUsdValue: chain.usdValue,
    };

    chain.accounts.forEach((account, index) => {
      point[`account${index + 1}`] = account.nativeBalance > 0 && chain.nativeBalance > 0
        ? Number(((account.nativeBalance / chain.nativeBalance) * chain.usdValue).toFixed(2))
        : 0;
    });

    return point;
  });

  return (
    <div className="rounded-xl border border-border/50 glass  p-6 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
          Treasury
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">USD Balance By Chain</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Unified operational treasury across all configured signing accounts
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 4, right: 6, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="chain"
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) =>
              value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value.toFixed(0)}`
            }
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={(value, name) => [formatUsd(Number(value)), `Account ${String(name).replace("account", "")}`]}
            labelFormatter={(value) => String(value)}
          />
          <Legend formatter={(value) => `Account ${String(value).replace("account", "")}`} />
          {Array.from({ length: maxAccounts }, (_, index) => (
            <Bar
              key={`account${index + 1}`}
              dataKey={`account${index + 1}`}
              stackId="usd"
              fill={index % 2 === 0 ? "#0ea5e9" : index % 3 === 0 ? "#8b5cf6" : "#14b8a6"}
              radius={index === maxAccounts - 1 ? [8, 8, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MultiChainDashboard({ data }: { data: MultiChainData }) {
  const healthyChains = data.chains.filter((chain) => !chain.error).length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 glass  p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
              Multi-Chain
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Treasury Overview</h2>
            <p className="mt-1 text-sm text-slate-500">
              Combined USD-equivalent balance across supported signing accounts
            </p>
          </div>
          <div className="rounded-2xl bg-foreground px-6 py-5 text-background shadow-lg ring-1 ring-white/10">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70">Total USD Value</p>
            <p className="mt-1 text-4xl font-black tracking-tight">{formatUsd(data.totalUsdValue)}</p>
            <p className="mt-2 text-[11px] font-medium opacity-60">
              {healthyChains}/{data.chains.length} chains active
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {data.priceUpdatedAt && <span>Prices refreshed {new Date(data.priceUpdatedAt).toLocaleString()}</span>}
          <span>Generated {new Date(data.generatedAt).toLocaleString()}</span>
          {data.source === "sample" && <span>Sample data</span>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {data.chains.map((chain) => (
          <TreasuryCard key={chain.chain} chain={chain} />
        ))}
      </div>

      <TreasuryChart data={data} />
    </div>
  );
}
