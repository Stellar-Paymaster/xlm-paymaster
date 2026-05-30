import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProgram } from "../src/cli/index";
import { FluidClient } from "../src/FluidClient";

vi.mock("../src/FluidClient");

describe("Fluid CLI - simulate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  it("should call requestFeeBump with correct arguments", async () => {
    const mockRequestFeeBump = vi.fn().mockResolvedValue({
      status: "ready",
      hash: "test-hash",
      xdr: "test-xdr",
      fee_payer: "test-payer",
    });

    (FluidClient as any).mockImplementation(function() {
      return {
        requestFeeBump: mockRequestFeeBump,
      };
    });

    await createProgram().parseAsync([
      "node",
      "fluid",
      "simulate",
      "inner-xdr",
      "--server",
      "https://custom.server",
      "--network",
      "custom-network",
    ]);

    expect(FluidClient).toHaveBeenCalledWith({
      serverUrl: "https://custom.server",
      networkPassphrase: "custom-network",
    });
    expect(mockRequestFeeBump).toHaveBeenCalledWith("inner-xdr", false);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Fee-bump simulation successful!"));
  });

  it("should output JSON when --json is provided", async () => {
    const mockResponse = {
      status: "ready",
      xdr: "test-xdr",
    };

    (FluidClient as any).mockImplementation(function() {
      return {
        requestFeeBump: vi.fn().mockResolvedValue(mockResponse),
      };
    });

    await createProgram().parseAsync([
      "node",
      "fluid",
      "simulate",
      "inner-xdr",
      "--json",
    ]);

    expect(console.log).toHaveBeenCalledWith(JSON.stringify(mockResponse, null, 2));
  });

  it("should handle errors gracefully", async () => {
    (FluidClient as any).mockImplementation(function() {
      return {
        requestFeeBump: vi.fn().mockRejectedValue(new Error("Network error")),
      };
    });

    await createProgram().parseAsync([
      "node",
      "fluid",
      "simulate",
      "inner-xdr",
    ]);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Simulation failed!"));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Network error"));
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
