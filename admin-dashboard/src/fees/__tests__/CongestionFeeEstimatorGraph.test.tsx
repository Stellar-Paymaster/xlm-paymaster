import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CongestionFeeEstimatorGraph } from "../components/CongestionFeeEstimatorGraph";

// Mock Recharts to avoid DOM measuring issues in JSDOM
vi.mock("recharts", async () => {
  const OriginalRechartsModule = await vi.importActual<any>("recharts");
  return {
    ...OriginalRechartsModule,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: "100%", height: "200px" }}>{children}</div>
    ),
  };
});

describe("CongestionFeeEstimatorGraph Component", () => {
  it("renders correctly with header and selector controls", () => {
    render(<CongestionFeeEstimatorGraph />);

    expect(screen.getByText("Congestion Fee Estimator Graph")).toBeInTheDocument();
    expect(screen.getByText("1. Set Base Fee (Stroops)")).toBeInTheDocument();
    expect(screen.getByLabelText(/Region/i)).toBeInTheDocument();
    expect(screen.getByTestId("congestion-fee-graph-card")).toBeInTheDocument();
  });

  it("handles base fee changes via presets", () => {
    render(<CongestionFeeEstimatorGraph />);

    // Click 1000 preset button
    const presetButton = screen.getByRole("button", { name: "1000" });
    fireEvent.click(presetButton);

    // The base fee text should be updated
    expect(screen.getAllByText("1000").length).toBeGreaterThan(0);
  });

  it("handles region changes correctly", () => {
    render(<CongestionFeeEstimatorGraph />);

    const select = screen.getByLabelText(/Region/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "APAC" } });

    expect(select.value).toBe("APAC");
  });

  it("handles interactive surge simulation and multiplier adjustments", () => {
    render(<CongestionFeeEstimatorGraph />);

    // Click Reset button if present, or check default simulator state
    // By default, selectedHour is 17 (5 PM)
    expect(screen.getByText("5 PM")).toBeInTheDocument();
    expect(screen.getByLabelText(/Simulate Congestion Multiplier/i)).toBeInTheDocument();

    const slider = screen.getByLabelText(/Simulate Congestion Multiplier/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "3.5" } });

    // The display text for multiplier should update (it should contain the simulated multiplier 3.50x)
    expect(screen.getByLabelText(/Simulate Congestion Multiplier \(3.50x\)/i)).toBeInTheDocument();
  });
});
