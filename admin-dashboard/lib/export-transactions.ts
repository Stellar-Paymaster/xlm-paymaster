import type { TransactionHistoryRow } from "@/components/dashboard/types";

const CSV_HEADERS = [
  "Time",
  "Inner Hash",
  "Status",
  "Category",
  "Cost (stroops)",
  "Tenant",
];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function rowToCSVFields(row: TransactionHistoryRow): string[] {
  return [
    formatTimestamp(row.timestamp),
    row.innerHash,
    row.status,
    row.category,
    String(row.costStroops),
    row.tenant,
  ];
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

export function exportToCSV(rows: TransactionHistoryRow[], filename?: string) {
  const header = CSV_HEADERS.map(escapeCSVField).join(",");
  const body = rows
    .map((row) => rowToCSVFields(row).map(escapeCSVField).join(","))
    .join("\n");

  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(
    blob,
    filename ??
      `fluid-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export async function exportToPDF(
  rows: TransactionHistoryRow[],
  filename?: string,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Fluid branding header
  doc.setFontSize(20);
  doc.setTextColor(14, 116, 144); // sky-700
  doc.text("Fluid", 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text("Transaction Report", 14, 25);

  const exportDate = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(`Exported: ${exportDate}`, pageWidth - 14, 18, { align: "right" });
  doc.text(
    `${rows.length} transaction${rows.length !== 1 ? "s" : ""}`,
    pageWidth - 14,
    25,
    { align: "right" },
  );

  // Separator line
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.line(14, 29, pageWidth - 14, 29);

  // Table
  const tableData = rows.map((row) => [
    formatTimestamp(row.timestamp),
    row.innerHash,
    row.status.charAt(0).toUpperCase() + row.status.slice(1),
    row.category,
    row.costStroops.toLocaleString(),
    row.tenant,
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
      fontSize: 7.5,
      textColor: [30, 41, 59], // slate-800
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 70, font: "courier", fontSize: 6.5 },
      2: { cellWidth: 22 },
      3: { cellWidth: 35 },
      4: { cellWidth: 30, halign: "right" },
      5: { cellWidth: 35 },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data: { pageNumber: number }) => {
      // Footer on every page
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Fluid — Stellar Fee Sponsorship Service | Page ${data.pageNumber}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: "center" },
      );
    },
  });

  doc.save(
    filename ??
      `fluid-transactions-${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}
