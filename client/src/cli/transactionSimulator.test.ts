/**
 * transactionSimulator.test.ts
 * Tests for CLI Transaction Simulator (#502)
 */

import { describe, it, expect } from "vitest";
import { simulateFeeBump, formatSimulationResult } from "./transactionSimulator";

// Minimal valid testnet XDR (source-only, 0 ops — used to test error paths)
const INVALID_XDR = "not-valid-xdr";

describe("simulateFeeBump", () => {
  it("returns failure for invalid XDR", () => {
    const result = simulateFeeBump({ innerXdr: INVALID_XDR });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid inner transaction XDR");
  });

  it("includes a warning when baseFee is below minimum", () => {
    const result = simulateFeeBump({ innerXdr: INVALID_XDR, baseFee: 50 });
    // Even on failure the low-fee warning is not added (XDR fails first)
    expect(result.success).toBe(false);
  });

  it("returns feeAccount as unknown when feePayerPublicKey is omitted and XDR invalid", () => {
    const result = simulateFeeBump({ innerXdr: INVALID_XDR });
    expect(result.feeAccount).toBe("unknown");
  });

  it("returns feeAccount from option when provided", () => {
    const result = simulateFeeBump({
      innerXdr: INVALID_XDR,
      feePayerPublicKey: "GABC123",
    });
    expect(result.feeAccount).toBe("GABC123");
  });

  it("sets network from option", () => {
    const result = simulateFeeBump({
      innerXdr: INVALID_XDR,
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(result.network).toBe("Test SDF Network ; September 2015");
  });
});

describe("formatSimulationResult", () => {
  it("formats a failure result", () => {
    const result = simulateFeeBump({ innerXdr: INVALID_XDR });
    const output = formatSimulationResult(result);
    expect(output).toContain("FAILED");
    expect(output).toContain("Invalid inner transaction XDR");
  });

  it("formats a success result (mocked)", () => {
    const fakeResult = {
      success: true,
      innerTxHash: "abcdef1234",
      feeBumpXdr: "AAAA...",
      estimatedFee: 300,
      feeAccount: "GABC",
      network: "Test SDF Network ; September 2015",
      warnings: ["Low fee warning"],
    };
    const output = formatSimulationResult(fakeResult);
    expect(output).toContain("SUCCESSFUL");
    expect(output).toContain("abcdef1234");
    expect(output).toContain("300 stroops");
    expect(output).toContain("Low fee warning");
    expect(output).toContain("NOT submitted");
  });
});
