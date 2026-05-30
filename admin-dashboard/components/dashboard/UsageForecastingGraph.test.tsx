import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UsageForecastingGraph } from "./UsageForecastingGraph";

// Mock Recharts to avoid DOM measuring issues in JSDOM
vi.mock("recharts", async () => {
  const OriginalRechartsModule = await vi.importActual<any>("recharts");
  return {
    ...OriginalRechartsModule,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: "100%", height: "300px" }}>{children}</div>
    ),
  };
});

describe("UsageForecastingGraph", () => {
  const mockHistoricalData = [
    { date: "2026-04-01", spend: 50 },
    { date: "2026-04-02", spend: 50 },
    { date: "2026-04-03", spend: 50 },
  ];

  it("renders correctly with historical data", () => {
    render(
      <UsageForecastingGraph
        currentBalance={150}
        historicalData={mockHistoricalData}
        tenantName="Acme Corp"
      />
    );

    expect(screen.getByText("Acme Corp - Usage Forecast")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getByTestId("forecasting-chart")).toBeInTheDocument();
  });

  it("displays the correct number of days until depletion", () => {
    // Current balance 150, avg spend 50/day. Should take 3 days to deplete.
    render(<UsageForecastingGraph currentBalance={150} historicalData={mockHistoricalData} tenantName="Acme Corp" />);

    expect(screen.getByText(/3 days/i)).toBeInTheDocument();
  });

  it("handles empty historical data gracefully", () => {
    render(<UsageForecastingGraph currentBalance={150} historicalData={[]} tenantName="Acme Corp" />);

    expect(screen.getByText("Not enough data to forecast usage for Acme Corp.")).toBeInTheDocument();
    expect(screen.queryByTestId("forecasting-chart")).not.toBeInTheDocument();
  });
});