"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Download, FileText, Loader2 } from "lucide-react";

import type { BillingPageData } from "@/lib/billing-data";
import {
  buildBillingStatement,
  exportBillingStatementToPDF,
  formatStatementMonthLabel,
  getStatementMonthOptions,
} from "@/lib/pdf-statement-export";
import { Button } from "@/components/ui/button";

interface BillingStatementExportProps {
  data: BillingPageData;
}

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

export function BillingStatementExport({ data }: BillingStatementExportProps) {
  const monthOptions = useMemo(() => getStatementMonthOptions(data.history), [data.history]);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value ?? "");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!monthOptions.some((option) => option.value === selectedMonth)) {
      setSelectedMonth(monthOptions[0]?.value ?? "");
    }
  }, [monthOptions, selectedMonth]);

  const statement = useMemo(
    () => buildBillingStatement(data, selectedMonth || undefined),
    [data, selectedMonth],
  );

  async function handleExport() {
    setExporting(true);
    setError(null);

    try {
      await exportBillingStatementToPDF(statement);
    } catch {
      setError("PDF export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-border/50 glass p-6 shadow-xl">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-foreground">Monthly PDF Statement</h2>
              <p className="text-sm text-muted-foreground">
                Finance-ready billing summaries with quota and payment detail.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
            <span className="rounded-full bg-background/70 px-3 py-1 text-foreground">
              {formatStatementMonthLabel(statement.month)}
            </span>
            <span className="rounded-full bg-background/70 px-3 py-1">
              {statement.source === "live" ? "Live data" : "Sample data"}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[320px]">
          <label className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground" htmlFor="billing-statement-month">
            Statement month
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                id="billing-statement-month"
                aria-label="Statement month"
                className="h-11 w-full appearance-none rounded-2xl border border-border/60 bg-background/80 pl-10 pr-4 text-sm font-medium text-foreground outline-none transition focus:border-primary"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="lg"
              className="h-11 rounded-2xl px-5"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? "Generating PDF..." : "Export PDF"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Successful</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{statement.summary.successfulPayments}</div>
          <div className="mt-1 text-sm text-muted-foreground">{formatCurrency(statement.summary.totalPaidCents)}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Pending</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{statement.summary.pendingPayments}</div>
          <div className="mt-1 text-sm text-muted-foreground">{formatCurrency(statement.summary.pendingAmountCents)}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Failed</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{statement.summary.failedPayments}</div>
          <div className="mt-1 text-sm text-muted-foreground">{formatCurrency(statement.summary.failedAmountCents)}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Quota Remaining</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-foreground">
            {statement.summary.quotaRemainingXlm.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {statement.summary.quotaUtilizationPercent.toFixed(1)}% utilized
          </div>
        </div>
      </div>

      {statement.rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No billing activity was recorded for {formatStatementMonthLabel(statement.month)}. The exported statement will include a zero-activity ledger.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
