import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignerBalanceRingChart } from "./SignerBalanceRingChart";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

describe("SignerBalanceRingChart", () => {
  it("renders active signer allocation and summary metrics", () => {
    render(
      <SignerBalanceRingChart
        signers={[
          {
            publicKey: "GAAAAAAACTIVE001",
            balance: "100.00 XLM",
            status: "Active",
            inFlight: 1,
            totalUses: 20,
            sequenceNumber: "1",
            source: "env",
            canRemove: false,
          },
          {
            publicKey: "GBBBBBBACTIVE002",
            balance: "50.00 XLM",
            status: "Active",
            inFlight: 0,
            totalUses: 15,
            sequenceNumber: "2",
            source: "db",
            canRemove: true,
          },
          {
            publicKey: "GCCCCCCLOWBAL003",
            balance: "2.10 XLM",
            status: "Low Balance",
            inFlight: 0,
            totalUses: 2,
            sequenceNumber: "3",
            source: "db",
            canRemove: true,
          },
        ]}
      />,
    );

    expect(screen.getByText("Signer Pool Ring Chart")).toBeInTheDocument();
    expect(screen.getByText("2 active signers")).toBeInTheDocument();
    expect(screen.getByText("150 XLM total active balance")).toBeInTheDocument();
    expect(within(screen.getByText("Inactive signers").closest("div") as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("shows a fallback when no active balances exist", () => {
    render(
      <SignerBalanceRingChart
        signers={[
          {
            publicKey: "GAAAAAAINACTIVE01",
            balance: "0.00 XLM",
            status: "Low Balance",
            inFlight: 0,
            totalUses: 0,
            sequenceNumber: "1",
            source: "env",
            canRemove: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("No active signer balances are available yet.")).toBeInTheDocument();
  });
});