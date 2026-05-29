import { auth } from "@/auth";
import Link from "next/link";
import {
  SignersTable,
  TransactionsTable,
} from "@/components/dashboard/ResponsiveTables";
import { getDashboardPageData } from "@/lib/dashboard-data";
import { StatCard } from "@/components/dashboard/StatCard";
import { UsageLeaderboard } from "@/components/dashboard/UsageLeaderboard";
import { getTenantLeaderboard } from "@/lib/transaction-history";
import { SpendChart } from "@/components/dashboard/SpendChart";
import { getApiKeysPageData } from "@/lib/api-keys-data";
import { Coins, CheckCircle, Wallet, Zap } from "lucide-react";
import { getSpendForecastData } from "@/lib/spend-chart-data";
import { getFeeMultiplierData } from "@/lib/fee-multiplier-data";
import { FeeEstimatorWidget } from "@/components/dashboard/FeeEstimatorWidget";
import { ExpenseBreakdown } from "@/components/dashboard/ExpenseBreakdown";
import { getExpenseBreakdownData } from "@/lib/expense-breakdown-data";
import { getTreasuryCriticalBannerState } from "@/lib/treasury-critical-banner";
import { AlertTriangle } from "lucide-react";
import { LiveTransactionFeed } from "@/components/dashboard/LiveTransactionFeed";

export default async function AdminDashboard() {
  const session = await auth();
  const { signers, transactions, source } = await getDashboardPageData();
  const tenantUsage = await getTenantLeaderboard();
  const spendForecast = await getSpendForecastData();
  const feeMultiplier = await getFeeMultiplierData();
  const expenseBreakdown = await getExpenseBreakdownData();
  const treasuryCriticalState = getTreasuryCriticalBannerState(spendForecast);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/50 glass  sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                Fluid Admin
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tighter text-foreground">
                Node Operations Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Transaction and signer visibility is optimized for mobile-first
                admin checks.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-border/50 glass  px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider shadow-inner">
                <div className="text-foreground">{session?.user?.email}</div>
                <div className="mt-0.5 opacity-60">
                  {source === "live"
                    ? "Live server data"
                    : "Real-time visibility enabled"}
                </div>
              </div>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {treasuryCriticalState.isCritical && (
          <section className="mb-6 rounded-2xl border border-rose-300 bg-rose-50 p-5 shadow-sm" aria-live="assertive">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
              <div>
                <h2 className="text-base font-bold text-rose-900">{treasuryCriticalState.title}</h2>
                <p className="mt-1 text-sm text-rose-800">{treasuryCriticalState.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-700">
                  {treasuryCriticalState.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <Link
                  href="/admin/billing"
                  className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full border border-rose-400 bg-white px-4 text-xs font-black uppercase tracking-wider text-rose-800 transition hover:bg-rose-100"
                >
                  Add Funds Now
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Stat Cards */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total XLM Sponsored"
            value="1,250,000"
            delta="+5% from last week"
            icon={Coins}
          />
          <StatCard
            title="Successful Transactions"
            value="45,678"
            delta="+12% from last week"
            icon={CheckCircle}
          />
          <StatCard
            title="Available Balance"
            value={`${spendForecast.currentBalanceXlm.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })} XLM`}
            delta={spendForecast.runwayMessage}
            icon={Wallet}
            action={
              <Link
                href="/admin/billing"
                className="rounded-full bg-primary px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary-foreground transition hover:scale-105 hover:shadow-lg active:scale-95"
              >
                Top-up
              </Link>
            }
          />
          <StatCard
            title="Dynamic Fee Multiplier"
            value={`${feeMultiplier.multiplier.toFixed(1)}x`}
            delta={`${feeMultiplier.congestionLevel} congestion`}
            icon={Zap}
          />
        </section>

        {/* Spend Analytics Charts */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <SpendChart forecast={spendForecast} />
          <ExpenseBreakdown data={expenseBreakdown} />
        </section>

        <section className="mt-6">
          <FeeEstimatorWidget />
        </section>

        {/* Tables */}
        <section className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/billing"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-6 text-sm font-black text-primary transition hover:shadow-lg hover:-translate-y-0.5"
            >
              Billing & Quota
            </Link>
            <Link
              href="/admin/webhooks"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border/50 glass  px-6 text-sm font-black text-foreground transition hover:shadow-lg hover:-translate-y-0.5"
            >
              Webhook settings
            </Link>
            <Link
              href="/admin/sandbox"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-amber-500/30 glass px-6 text-sm font-black text-amber-500 transition hover:shadow-lg hover:-translate-y-0.5"
            >
              Sandbox
            </Link>
            <Link
              href="/admin/chains"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border/50 glass  px-6 text-sm font-black text-foreground transition hover:shadow-lg hover:-translate-y-0.5"
            >
              Chain registry
            </Link>
            <Link
              href="/admin/signers"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border/50 glass  px-6 text-sm font-black text-foreground transition hover:shadow-lg hover:-translate-y-0.5"
            >
              Manage signer pool
            </Link>
            <Link
              href="/admin/transactions"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-8 text-sm font-black text-background transition hover:shadow-xl hover:-translate-y-0.5"
            >
              Open transaction history
            </Link>
          </div>
          <LiveTransactionFeed />
          <TransactionsTable transactions={transactions} />
          <SignersTable signers={signers} />
          <UsageLeaderboard rows={tenantUsage} />
        </section>
      </main>
    </div>
  );
}