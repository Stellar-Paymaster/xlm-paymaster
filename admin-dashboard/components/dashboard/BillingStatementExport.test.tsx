import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingPageData } from "@/lib/billing-data";
import { BillingStatementExport } from "@/components/dashboard/BillingStatementExport";

const { exportBillingStatementToPDF } = vi.hoisted(() => ({
  exportBillingStatementToPDF: vi.fn(),
}));

vi.mock("@/lib/pdf-statement-export", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-statement-export")>("@/lib/pdf-statement-export");

  return {
    ...actual,
    exportBillingStatementToPDF,
  };
});

const billingData: BillingPageData = {
  currentBalanceXlm: 2000,
  quotaUsedXlm: 500,
  quotaTotalXlm: 3000,
  source: "sample",
  history: [
    {
      id: "row-1",
      date: "2026-03-05T10:00:00Z",
      amountCents: 2000,
      status: "succeeded",
      description: "March funding",
      invoiceUrl: "https://billing.example.com/invoices/row-1",
    },
    {
      id: "row-2",
      date: "2026-02-01T10:00:00Z",
      amountCents: 900,
      status: "failed",
      description: "February retry",
    },
  ],
};

describe("BillingStatementExport", () => {
  beforeEach(() => {
    exportBillingStatementToPDF.mockReset();
  });

  it("renders a finance statement panel with the latest month selected", () => {
    render(React.createElement(BillingStatementExport, { data: billingData }));

    expect(screen.getByText("Monthly PDF Statement")).toBeInTheDocument();
    expect(screen.getByLabelText("Statement month")).toHaveValue("2026-03");
    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByText("Quota Remaining")).toBeInTheDocument();
  });

  it("exports the selected statement month", async () => {
    const user = userEvent.setup();
    render(React.createElement(BillingStatementExport, { data: billingData }));

    await user.selectOptions(screen.getByLabelText("Statement month"), "2026-02");
    await user.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => expect(exportBillingStatementToPDF).toHaveBeenCalledTimes(1));

    const [statement] = exportBillingStatementToPDF.mock.calls[0];
    expect(statement.month).toBe("2026-02");
    expect(statement.rows).toHaveLength(1);
    expect(statement.summary.failedPayments).toBe(1);
  });

  it("shows an alert when PDF export fails", async () => {
    exportBillingStatementToPDF.mockRejectedValueOnce(new Error("boom"));

    const user = userEvent.setup();
    render(
      React.createElement(BillingStatementExport, {
        data: {
          ...billingData,
          history: [],
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("PDF export failed. Please try again.");
    expect(screen.getByText(/zero-activity ledger/i)).toBeInTheDocument();
  });
});
