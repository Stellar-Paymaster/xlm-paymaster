import { describe, it, expect, vi } from "vitest";
import {
  assertDryRunSuccess,
  ContractCallFailureError,
  type ContractCallSimulator,
  type DryRunResult,
} from "./contractCallFailure";

// ─── helpers ────────────────────────────────────────────────────────────────

function mockSimulator(result: DryRunResult): ContractCallSimulator {
  return { simulate: vi.fn().mockResolvedValue(result) };
}

const VALID_XDR = "AAAAAgAAAACL1Nq6bR9cS3j7ktV4yF/qKOY48EAKrWOXPtUgOnjqPAAAAGQ=";

// ─── success path ────────────────────────────────────────────────────────────

describe("assertDryRunSuccess – success path", () => {
  it("resolves without throwing for a successful dry-run", async () => {
    const sim = mockSimulator({ status: "success" });
    await expect(assertDryRunSuccess(sim, VALID_XDR)).resolves.toBeUndefined();
  });

  it("calls simulate with the provided XDR", async () => {
    const sim = mockSimulator({ status: "success" });
    await assertDryRunSuccess(sim, VALID_XDR);
    expect(sim.simulate).toHaveBeenCalledWith(VALID_XDR);
  });
});

// ─── failure path ────────────────────────────────────────────────────────────

describe("assertDryRunSuccess – failure path", () => {
  it("throws ContractCallFailureError when status is 'failed'", async () => {
    const sim = mockSimulator({ status: "failed", reason: "insufficient balance" });
    await expect(assertDryRunSuccess(sim, VALID_XDR)).rejects.toThrow(
      ContractCallFailureError
    );
  });

  it("throws ContractCallFailureError when status is 'malformed'", async () => {
    const sim = mockSimulator({ status: "malformed", reason: "bad XDR" });
    await expect(assertDryRunSuccess(sim, VALID_XDR)).rejects.toThrow(
      ContractCallFailureError
    );
  });

  it("error message includes the reason", async () => {
    const sim = mockSimulator({ status: "failed", reason: "contract panicked" });
    await expect(assertDryRunSuccess(sim, VALID_XDR)).rejects.toThrow(
      "contract panicked"
    );
  });

  it("error message includes the errorCode when present", async () => {
    const sim = mockSimulator({
      status: "failed",
      reason: "wasm trap",
      errorCode: "INVOKE_HOST_FUNCTION_TRAPPED",
    });
    await expect(assertDryRunSuccess(sim, VALID_XDR)).rejects.toThrow(
      "INVOKE_HOST_FUNCTION_TRAPPED"
    );
  });

  it("error message falls back to 'unknown failure' when reason is absent", async () => {
    const sim = mockSimulator({ status: "failed" });
    await expect(assertDryRunSuccess(sim, VALID_XDR)).rejects.toThrow(
      "unknown failure"
    );
  });
});

// ─── ContractCallFailureError shape ──────────────────────────────────────────

describe("ContractCallFailureError", () => {
  it("has the correct name", () => {
    const err = new ContractCallFailureError("test");
    expect(err.name).toBe("ContractCallFailureError");
  });

  it("exposes reason and errorCode", () => {
    const err = new ContractCallFailureError("bad call", "ERR_CODE");
    expect(err.reason).toBe("bad call");
    expect(err.errorCode).toBe("ERR_CODE");
  });

  it("is an instance of Error", () => {
    expect(new ContractCallFailureError("x")).toBeInstanceOf(Error);
  });
});

// ─── edge cases ──────────────────────────────────────────────────────────────

describe("assertDryRunSuccess – edge cases", () => {
  it("does not call fee-bump when dry-run fails (simulate called exactly once)", async () => {
    const sim = mockSimulator({ status: "failed", reason: "out of gas" });
    const feeBumpSpy = vi.fn();

    try {
      await assertDryRunSuccess(sim, VALID_XDR);
      // If we reach here the test should fail
      feeBumpSpy();
    } catch {
      // expected
    }

    expect(sim.simulate).toHaveBeenCalledTimes(1);
    expect(feeBumpSpy).not.toHaveBeenCalled();
  });

  it("propagates simulator network errors without wrapping", async () => {
    const sim: ContractCallSimulator = {
      simulate: vi.fn().mockRejectedValue(new Error("RPC timeout")),
    };
    await expect(assertDryRunSuccess(sim, VALID_XDR)).rejects.toThrow("RPC timeout");
  });

  it("handles empty XDR string without crashing the simulator call", async () => {
    const sim = mockSimulator({ status: "malformed", reason: "empty XDR" });
    await expect(assertDryRunSuccess(sim, "")).rejects.toThrow(ContractCallFailureError);
    expect(sim.simulate).toHaveBeenCalledWith("");
  });
});
