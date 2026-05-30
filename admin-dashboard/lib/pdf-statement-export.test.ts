import { afterEach, describe, expect, it, vi } from "vitest";

import type { BillingPageData } from "@/lib/billing-data";
import {
  buildBillingStatement,
  exportBillingStatementToPDF,
  formatStatementDate,
  getBillingStatementFilename,
  getStatementMonthOptions,
  resolveStatementMonth,
} from "@/lib/pdf-statement-export";

const baseData: BillingPageData = {
  currentBalanceXlm: 1200.5,
  quotaUsedXlm: 300,
  quotaTotalXlm: 1500,
  source: "live",
  history: [
    {
      id: "march-success",
      date: "2026-03-20T10:00:00Z",
      amountCents: 5000,
      status: "succeeded",
      description: "Quota Top-up (1,500 XLM)",
      invoiceUrl: "https://billing.example.com/invoices/march-success",
    },
    {
      id: "march-pending",
      date: "2026-03-12T08:30:00Z",
      amountCents: 1250,
      status: "pending",
      description: "Pending quota refill",
    },
    {
      id: "march-failed",
      date: "2026-03-01T09:00:00Z",
      amountCents: 800,
      status: "failed",
      description: "Failed card capture",
    },
    {
      id: "feb-success",
      date: "2026-02-14T12:15:00Z",
      amountCents: 2000,
      status: "succeeded",
      description: "February top-up",
      invoiceUrl: "https://billing.example.com/invoices/feb-success",
    },
    {
      id: "invalid-date",
      date: "not-a-date",
      amountCents: Number.NaN,
      status: "succeeded",
      description: "",
    },
  ],
};

describe("pdf statement helpers", () => {
  it("builds month options from billing history and sorts newest first", () => {
    const options = getStatementMonthOptions(baseData.history);

    expect(options).toEqual([
      { value: "2026-03", label: "March 2026" },
      { value: "2026-02", label: "February 2026" },
    ]);
  });

  it("falls back to the current month when there is no valid history", () => {
    const options = getStatementMonthOptions(
      [
        {
          id: "broken",
          date: "bad-date",
          amountCents: 0,
          status: "succeeded",
          description: "Broken row",
        },
      ],
      new Date("2026-04-23T00:00:00Z"),
    );

    expect(options).toEqual([{ value: "2026-04", label: "April 2026" }]);
  });

  it("builds a monthly statement with payment totals and edge-case handling", () => {
    const statement = buildBillingStatement(baseData, "2026-03", new Date("2026-04-23T13:30:00Z"));

    expect(statement.month).toBe("2026-03");
    expect(statement.label).toBe("March 2026");
    expect(statement.rows.map((row) => row.id)).toEqual([
      "march-success",
      "march-pending",
      "march-failed",
    ]);
    expect(statement.summary).toMatchObject({
      currentBalanceXlm: 1200.5,
      quotaRemainingXlm: 1200,
      quotaUtilizationPercent: 20,
      totalPaidCents: 5000,
      pendingAmountCents: 1250,
      failedAmountCents: 800,
      successfulPayments: 1,
      pendingPayments: 1,
      failedPayments: 1,
    });
    expect(statement.note).toContain("finance review");
  });

  it("resolves the requested month against available history", () => {
    expect(resolveStatementMonth(baseData.history, "2026-02")).toBe("2026-02");
    expect(resolveStatementMonth(baseData.history, "2026-01", new Date("2026-04-23T00:00:00Z"))).toBe("2026-03");
  });

  it("formats dates and filenames consistently", () => {
    const statement = buildBillingStatement(baseData, "2026-02", new Date("2026-04-23T13:30:00Z"));

    expect(formatStatementDate("2026-02-14T12:15:00Z")).toBe("Feb 14, 2026");
    expect(formatStatementDate("bad-date")).toBe("Unknown date");
    expect(getBillingStatementFilename(statement)).toBe("fluid-billing-statement-2026-02.pdf");
  });
});

describe("exportBillingStatementToPDF", () => {
  afterEach(() => {
    vi.doUnmock("jspdf");
    vi.doUnmock("jspdf-autotable");
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the statement PDF and triggers a download", async () => {
    const saveAnchor = {
      click: vi.fn(),
      href: "",
      download: "",
    } as unknown as HTMLAnchorElement;

    const appendChild = vi.fn();
    const removeChild = vi.fn();

    vi.stubGlobal("document", {
      body: {
        appendChild,
        removeChild,
      },
      createElement: vi.fn(() => saveAnchor),
    });

    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:statement"),
      revokeObjectURL: vi.fn(),
    });

    const text = vi.fn();
    const line = vi.fn();
    const output = vi.fn(() => new Blob(["pdf"]));
    const setFontSize = vi.fn();
    const setTextColor = vi.fn();
    const setDrawColor = vi.fn();
    const setLineWidth = vi.fn();

    const autoTable = vi.fn();

    vi.doMock("jspdf", () => ({
      default: vi.fn(function MockJsPDF() {
        return {
          internal: {
            pageSize: {
              getWidth: () => 297,
              getHeight: () => 210,
            },
          },
          setFontSize,
          setTextColor,
          text,
          setDrawColor,
          setLineWidth,
          line,
          output,
        };
      }),
    }));

    vi.doMock("jspdf-autotable", () => ({
      default: autoTable,
    }));

    const statement = buildBillingStatement(baseData, "2026-03", new Date("2026-04-23T13:30:00Z"));

    await exportBillingStatementToPDF(statement);

    expect(autoTable).toHaveBeenCalledTimes(2);
    expect(text).toHaveBeenCalledWith("Monthly Billing Statement", 14, 25);
    expect(saveAnchor.download).toBe("fluid-billing-statement-2026-03.pdf");
    expect(saveAnchor.click).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledWith(saveAnchor);
    expect(removeChild).toHaveBeenCalledWith(saveAnchor);
  });
});
