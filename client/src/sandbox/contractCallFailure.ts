/**
 * Simulated contract call failure detection.
 *
 * Before spending real fees on a fee-bump, the client should detect
 * transactions that are destined to fail during Soroban contract dry-runs
 * and reject them early.
 */

export type DryRunStatus = "success" | "failed" | "malformed";

export interface DryRunResult {
  status: DryRunStatus;
  /** Human-readable reason when status !== "success" */
  reason?: string;
  /** Raw error code returned by the RPC node */
  errorCode?: string;
}

export interface ContractCallSimulator {
  simulate(xdr: string): Promise<DryRunResult>;
}

/** Error thrown when a transaction is rejected before fee-bumping. */
export class ContractCallFailureError extends Error {
  constructor(
    public readonly reason: string,
    public readonly errorCode?: string
  ) {
    super(`Contract dry-run failed: ${reason}${errorCode ? ` (${errorCode})` : ""}`);
    this.name = "ContractCallFailureError";
  }
}

/**
 * Wraps a ContractCallSimulator and throws ContractCallFailureError
 * for any non-success dry-run result, preventing fee waste.
 */
export async function assertDryRunSuccess(
  simulator: ContractCallSimulator,
  xdr: string
): Promise<void> {
  const result = await simulator.simulate(xdr);
  if (result.status !== "success") {
    throw new ContractCallFailureError(
      result.reason ?? "unknown failure",
      result.errorCode
    );
  }
}
