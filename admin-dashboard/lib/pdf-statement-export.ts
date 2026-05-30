import type { BillingHistoryRow, BillingPageData } from "@/lib/billing-data";

export interface BillingStatementMonthOption {
  value: string;
  label: string;
}

export interface BillingStatementRow {
  id: string;
  date: string;
  description: string;
  status: BillingHistoryRow["status"];
  amountCents: number;
  invoiceState: "on_file" | "not_attached";
}

export interface BillingStatementSummary {
  currentBalanceXlm: number;
  quotaUsedXlm: number;
  quotaTotalXlm: number;
  quotaRemainingXlm: number;
  quotaUtilizationPercent: number;
  totalPaidCents: number;
  pendingAmountCents: number;
  failedAmountCents: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
}

export interface BillingStatement {
  month: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  source: BillingPageData["source"];
  note: string;
  rows: BillingStatementRow[];
  summary: BillingStatementSummary;
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const statementDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const generatedAtFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseHistoryDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clampMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function getMonthRange(month: string) {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error(`Invalid statement month: ${month}`);
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const endExclusive = new Date(Date.UTC(year, monthIndex + 1, 1));
  const endInclusive = new Date(endExclusive.getTime() - 1);

  return { start, endExclusive, endInclusive };
}

export function formatStatementMonthLabel(month: string): string {
  return monthFormatter.format(getMonthRange(month).start);
}

export function formatStatementDate(value: string): string {
  const parsed = parseHistoryDate(value);
  return parsed ? statementDateFormatter.format(parsed) : "Unknown date";
}

export function getStatementMonthOptions(
  history: BillingHistoryRow[],
  now: Date = new Date(),
): BillingStatementMonthOption[] {
  const monthValues = new Set<string>();

  for (const row of history) {
    const parsed = parseHistoryDate(row.date);
    if (parsed) {
      monthValues.add(formatMonthKey(parsed));
    }
  }

  if (monthValues.size === 0) {
    monthValues.add(formatMonthKey(now));
  }

  return Array.from(monthValues)
    .sort((left, right) => right.localeCompare(left))
    .map((value) => ({ value, label: formatStatementMonthLabel(value) }));
}

export function resolveStatementMonth(
  history: BillingHistoryRow[],
  requestedMonth?: string,
  now: Date = new Date(),
): string {
  const options = getStatementMonthOptions(history, now);

  if (requestedMonth && options.some((option) => option.value === requestedMonth)) {
    return requestedMonth;
  }

  return options[0].value;
}

export function buildBillingStatement(
  data: BillingPageData,
  requestedMonth?: string,
  generatedAt: Date = new Date(),
): BillingStatement {
  const month = resolveStatementMonth(data.history, requestedMonth, generatedAt);
  const { start, endExclusive, endInclusive } = getMonthRange(month);

  const rows = data.history
    .flatMap((row) => {
      const parsed = parseHistoryDate(row.date);
      if (!parsed || parsed < start || parsed >= endExclusive) {
        return [];
      }

      return [
        {
          id: row.id,
          date: row.date,
          description: row.description.trim() || "Billing activity",
          status: row.status,
          amountCents: clampMoney(row.amountCents),
          invoiceState: row.invoiceUrl ? "on_file" : "not_attached",
        } satisfies BillingStatementRow,
      ];
    })
    .sort((left, right) => right.date.localeCompare(left.date));

  const summary = rows.reduce<BillingStatementSummary>(
    (current, row) => {
      if (row.status === "succeeded") {
        current.successfulPayments += 1;
        current.totalPaidCents += row.amountCents;
      }

      if (row.status === "pending") {
        current.pendingPayments += 1;
        current.pendingAmountCents += row.amountCents;
      }

      if (row.status === "failed") {
        current.failedPayments += 1;
        current.failedAmountCents += row.amountCents;
      }

      return current;
    },
    {
      currentBalanceXlm: clampNumber(data.currentBalanceXlm),
      quotaUsedXlm: clampNumber(data.quotaUsedXlm),
      quotaTotalXlm: Math.max(clampNumber(data.quotaTotalXlm), 0),
      quotaRemainingXlm: Math.max(clampNumber(data.quotaTotalXlm) - clampNumber(data.quotaUsedXlm), 0),
      quotaUtilizationPercent:
        clampNumber(data.quotaTotalXlm) > 0
          ? Math.min((clampNumber(data.quotaUsedXlm) / clampNumber(data.quotaTotalXlm)) * 100, 100)
          : 0,
      totalPaidCents: 0,
      pendingAmountCents: 0,
      failedAmountCents: 0,
      successfulPayments: 0,
      pendingPayments: 0,
      failedPayments: 0,
    },
  );

  return {
    month,
    label: formatStatementMonthLabel(month),
    periodStart: start.toISOString(),
    periodEnd: endInclusive.toISOString(),
    generatedAt: generatedAt.toISOString(),
    source: data.source,
    note:
      data.source === "live"
        ? "Generated from the Fluid billing ledger for finance review."
        : "Generated from sample billing data. Do not use for external reporting.",
    rows,
    summary,
  };
}

export function getBillingStatementFilename(statement: BillingStatement): string {
  return `fluid-billing-statement-${statement.month}.pdf`;
}

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

function formatGeneratedAt(value: string): string {
  const parsed = parseHistoryDate(value);
  return parsed ? generatedAtFormatter.format(parsed) : "Unavailable";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function exportBillingStatementToPDF(
  statement: BillingStatement,
  filename: string = getBillingStatementFilename(statement),
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(20);
  doc.setTextColor(14, 116, 144);
  doc.text("Fluid", 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text("Monthly Billing Statement", 14, 25);
  doc.text(statement.label, 14, 31);

  doc.setFontSize(9);
  doc.text(`Generated: ${formatGeneratedAt(statement.generatedAt)}`, pageWidth - 14, 18, { align: "right" });
  doc.text(`Source: ${statement.source === "live" ? "Live billing data" : "Sample environment data"}`, pageWidth - 14, 24, {
    align: "right",
  });

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 35, pageWidth - 14, 35);

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Period: ${statementDateFormatter.format(new Date(statement.periodStart))} - ${statementDateFormatter.format(new Date(statement.periodEnd))}`, 14, 42);
  doc.text(statement.note, 14, 48);

  const summaryRows = [
    ["Current balance", `${statement.summary.currentBalanceXlm.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM`],
    ["Quota remaining", `${statement.summary.quotaRemainingXlm.toLocaleString("en-US", { maximumFractionDigits: 2 })} / ${statement.summary.quotaTotalXlm.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM`],
    ["Quota utilization", `${statement.summary.quotaUtilizationPercent.toFixed(1)}%`],
    ["Successful top-ups", `${statement.summary.successfulPayments} (${formatCurrency(statement.summary.totalPaidCents)})`],
    ["Pending items", `${statement.summary.pendingPayments} (${formatCurrency(statement.summary.pendingAmountCents)})`],
    ["Failed items", `${statement.summary.failedPayments} (${formatCurrency(statement.summary.failedAmountCents)})`],
  ];

  autoTable(doc, {
    startY: 53,
    theme: "grid",
    head: [["Metric", "Value"]],
    body: summaryRows,
    margin: { left: 14, right: pageWidth / 2 + 10 },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  autoTable(doc, {
    startY: 53,
    theme: "grid",
    head: [["Date", "Transaction ID", "Description", "Status", "Amount", "Invoice"]],
    body:
      statement.rows.length > 0
        ? statement.rows.map((row) => [
            formatStatementDate(row.date),
            row.id,
            row.description,
            row.status,
            formatCurrency(row.amountCents),
            row.invoiceState === "on_file" ? "On file" : "Not attached",
          ])
        : [["No activity", "-", "No billing transactions recorded for this month.", "-", "$0.00", "-"]],
    margin: { left: pageWidth / 2 + 14, right: 14 },
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 28, font: "courier", fontSize: 7 },
      2: { cellWidth: 42 },
      3: { cellWidth: 16 },
      4: { cellWidth: 18, halign: "right" },
      5: { cellWidth: 18 },
    },
    didDrawPage: (context: { pageNumber: number }) => {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Fluid billing statement | Page ${context.pageNumber}`, pageWidth / 2, pageHeight - 8, {
        align: "center",
      });
    },
  });

  const output = doc.output("blob");
  triggerDownload(output, filename);
}
