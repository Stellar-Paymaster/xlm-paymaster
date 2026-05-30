import { auth } from "@/auth";
import { getBillingPageData } from "@/lib/billing-data";
import { BillingTopUp } from "@/components/dashboard/BillingTopUp";
import { BillingStatementExport } from "@/components/dashboard/BillingStatementExport";
import { StatCard } from "@/components/dashboard/StatCard";
import { Wallet, History, ArrowUpRight, Download, CreditCard } from "lucide-react";
import Link from "next/link";

export default async function BillingPage() {
  const session = await auth();
  const data = await getBillingPageData();

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/50 glass sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                Billing & Quota
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tighter text-foreground">
                Payment Center
              </h1>
            </div>
            <div className="flex items-center gap-4">
               <Link
                href="/admin/dashboard"
                className="rounded-full border border-border/50 glass px-6 py-2 text-sm font-bold text-foreground transition hover:bg-muted"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Stats and Top-up */}
          <div className="lg:col-span-2 space-y-8">
            <section className="grid gap-4 sm:grid-cols-2">
              <StatCard
                title="Current XLM Balance"
                value={`${data.currentBalanceXlm.toLocaleString()} XLM`}
                delta="Available for sponsorship"
                icon={Wallet}
              />
              <StatCard
                title="Quota Utilization"
                value={`${((data.quotaUsedXlm / data.quotaTotalXlm) * 100).toFixed(1)}%`}
                delta={`${data.quotaUsedXlm.toLocaleString()} / ${data.quotaTotalXlm.toLocaleString()} XLM`}
                icon={ArrowUpRight}
              />
            </section>

            <BillingStatementExport data={data} />

            <BillingTopUp tenantId={session?.user?.id ?? "tenant-1"} />

            <section className="overflow-hidden rounded-3xl border border-border/50 glass shadow-xl">
              <div className="p-6 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-bold">Payment History</h2>
                </div>
                <div className="text-right text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Statement export available above
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="px-6 py-4">Transaction ID</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.history.map((row) => (
                      <tr key={row.id} className="group hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                          {row.id}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">
                          {new Date(row.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground/80">
                          {row.description}
                        </td>
                        <td className="px-6 py-4 text-sm font-black">
                          ${(row.amountCents / 100).toFixed(2)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            row.status === "succeeded" 
                              ? "bg-emerald-500/10 text-emerald-500" 
                              : "bg-amber-500/10 text-amber-500"
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 glass text-muted-foreground transition hover:text-primary hover:border-primary/50">
                            <Download className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Right Column: Billing Info & Cards */}
          <div className="space-y-8">
             <section className="rounded-3xl border border-border/50 glass p-6 shadow-xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Payment Method
              </h3>
              <div className="rounded-2xl bg-slate-950 p-6 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 -mr-8 -mt-8 h-32 w-32 bg-primary/20 blur-3xl group-hover:bg-primary/30 transition-colors" />
                <div className="flex justify-between items-start mb-12">
                  <div className="h-10 w-14 rounded-lg bg-slate-800/50 flex items-center justify-center border border-white/10">
                    <div className="h-6 w-10 rounded bg-white/20" />
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Primary</div>
                </div>
                <div className="text-xl font-mono tracking-[0.2em] mb-4">•••• •••• •••• 4242</div>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Card Holder</div>
                    <div className="text-xs font-bold uppercase tracking-wider">{session?.user?.name ?? "Fluid Tenant"}</div>
                  </div>
                  <div>
                    <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Expires</div>
                    <div className="text-xs font-bold">12 / 28</div>
                  </div>
                </div>
              </div>
              <button className="mt-6 w-full rounded-2xl border border-border/50 glass py-3 text-sm font-black uppercase tracking-widest text-foreground transition hover:bg-muted">
                Update Card
              </button>
            </section>

            <section className="rounded-3xl border border-border/50 glass p-6 shadow-xl bg-primary/5">
              <h3 className="text-lg font-bold mb-2">Auto Top-up</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Automatically refill your quota when it falls below 500 XLM to ensure uninterrupted service.
              </p>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-background/50 border border-border/50">
                <span className="text-sm font-bold">Status</span>
                <span className="text-xs font-black uppercase tracking-wider text-primary">Active</span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
