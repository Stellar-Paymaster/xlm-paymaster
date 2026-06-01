import type { TenantUsageRow } from "../components/dashboard/types";

const CSV_HEADERS = [
  "Rank",
  "Tenant",
  "Transactions",
  "Successful",
  "Failed",
  "Total Cost (stroops)",
];

function formatStroops(stroops: number): string {
  if (stroops >= 10_000_000) {
    return `${(stroops / 10_000_000).toFixed(2)} XLM`;
  }
  return `${stroops.toLocaleString()} stroops`;
}

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function rowToCSVFields(row: TenantUsageRow, rank: number): string[] {
  return [
    String(rank),
    row.tenant,
    String(row.txCount),
    String(row.successCount),
    String(row.failedCount),
    String(row.totalCostStroops),
  ];
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportLeaderboardToCSV(
  rows: TenantUsageRow[],
  filename?: string,
): void {
  const sorted = [...rows].sort((a, b) => b.totalCostStroops - a.totalCostStroops);
  const header = CSV_HEADERS.map(escapeCSVField).join(",");
  const body = sorted
    .map((row, index) => rowToCSVFields(row, index + 1).map(escapeCSVField).join(","))
    .join("\n");

  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(
    blob,
    filename ?? `fluid-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export async function exportLeaderboardToPDF(
  rows: TenantUsageRow[],
  filename?: string,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const sorted = [...rows].sort((a, b) => b.totalCostStroops - a.totalCostStroops);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(20);
  doc.setTextColor(14, 116, 144);
  doc.text("Fluid", 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("Tenant Usage Leaderboard", 14, 25);

  const exportDate = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(`Exported: ${exportDate}`, pageWidth - 14, 18, { align: "right" });
  doc.text(
    `${sorted.length} tenant${sorted.length !== 1 ? "s" : ""}`,
    pageWidth - 14,
    25,
    { align: "right" },
  );

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 29, pageWidth - 14, 29);

  const tableData = sorted.map((row, index) => [
    String(index + 1),
    row.tenant,
    row.txCount.toLocaleString(),
    row.successCount.toLocaleString(),
    row.failedCount.toLocaleString(),
    formatStroops(row.totalCostStroops),
  ]);

  autoTable(doc, {
    startY: 33,
    head: [CSV_HEADERS],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 60 },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 36, halign: "right" },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data: { pageNumber: number }) => {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Fluid — Tenant Usage Report | Page ${data.pageNumber}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: "center" },
      );
    },
  });

  doc.save(
    filename ?? `fluid-leaderboard-${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}
