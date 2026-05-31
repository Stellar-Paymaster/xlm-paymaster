import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiKeyUsageCharts } from "@/components/dashboard/ApiKeyUsageCharts";
import type { ApiKeyUsageStat } from "@/lib/api-key-usage-data";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "responsive-container" }, children),
  };
});

const SAMPLE_STATS: ApiKeyUsageStat[] = [
  {
    keyId: "key-01",
    label: "flud…1234",
    tenantId: "tenant-a",
    successCount: 1150,
    failedCount: 50,
    totalCount: 1200,
    failureRatePct: 4,
    totalCostStroops: 115_000,
  },
  {
    keyId: "key-02",
    label: "flud…5678",
    tenantId: "tenant-b",
    successCount: 2200,
    failedCount: 100,
    totalCount: 2300,
    failureRatePct: 4,
    totalCostStroops: 220_000,
  },
];

describe("ApiKeyUsageCharts", () => {
  it("renders three chart sections for non-empty stats", () => {
    render(React.createElement(ApiKeyUsageCharts, { stats: SAMPLE_STATS }));
    expect(screen.getByText("Requests per Key")).toBeInTheDocument();
    expect(screen.getByText("Failure Rate (%)")).toBeInTheDocument();
    expect(screen.getByText("Cost per Key (stroops)")).toBeInTheDocument();
  });

  it("renders an empty state when stats array is empty", () => {
    render(React.createElement(ApiKeyUsageCharts, { stats: [] }));
    expect(
      screen.getByText("No usage data available for the current key set."),
    ).toBeInTheDocument();
  });

  it("does not render charts in empty state", () => {
    render(React.createElement(ApiKeyUsageCharts, { stats: [] }));
    expect(screen.queryByText("Requests per Key")).not.toBeInTheDocument();
  });

  it("renders chart containers for each chart section", () => {
    render(React.createElement(ApiKeyUsageCharts, { stats: SAMPLE_STATS }));
    const containers = screen.getAllByTestId("responsive-container");
    expect(containers.length).toBe(3);
  });
});
