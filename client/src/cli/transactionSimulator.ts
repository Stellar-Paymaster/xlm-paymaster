/**
 * transactionSimulator.ts
 * CLI Transaction Simulator (#502)
 *
 * Simulates fee-bump transactions from the command line without submitting.
 */

import StellarSdk from "@stellar/stellar-sdk";

export interface SimulateFeeBumpOptions {
  innerXdr: string;
  networkPassphrase?: string;
  feePayerPublicKey?: string;
  baseFee?: number;
}

export interface SimulationResult {
  success: boolean;
  innerTxHash: string;
  feeBumpXdr?: string;
  estimatedFee: number;
  feeAccount: string;
  network: string;
  warnings: string[];
  error?: string;
}

/**
 * Simulate building a fee-bump transaction around an inner XDR.
 * Does NOT submit to the network.
 */
export function simulateFeeBump(options: SimulateFeeBumpOptions): SimulationResult {
  const {
    innerXdr,
    networkPassphrase = StellarSdk.Networks.TESTNET,
    feePayerPublicKey,
    baseFee = 100,
  } = options;

  const warnings: string[] = [];

  // Validate inner XDR
  let innerTx: StellarSdk.Transaction;
  try {
    innerTx = new StellarSdk.Transaction(innerXdr, networkPassphrase);
  } catch (err) {
    return {
      success: false,
      innerTxHash: "",
      estimatedFee: 0,
      feeAccount: feePayerPublicKey ?? "unknown",
      network: networkPassphrase,
      warnings,
      error: `Invalid inner transaction XDR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const innerHash = innerTx.hash().toString("hex");
  const numOps = innerTx.operations.length;
  const estimatedFee = baseFee * (numOps + 1); // +1 for the fee-bump envelope

  if (baseFee < 100) {
    warnings.push(`baseFee (${baseFee}) is below the Stellar minimum of 100 stroops`);
  }

  if (numOps === 0) {
    warnings.push("Inner transaction has 0 operations");
  }

  const feePayer = feePayerPublicKey ?? innerTx.source;

  // Build the fee-bump envelope (dry-run, no keypair needed)
  let feeBumpXdr: string | undefined;
  try {
    const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      feePayer,
      String(estimatedFee),
      innerTx,
      networkPassphrase
    );
    feeBumpXdr = feeBumpTx.toXDR();
  } catch (err) {
    warnings.push(`Could not build fee-bump envelope: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    success: true,
    innerTxHash: innerHash,
    feeBumpXdr,
    estimatedFee,
    feeAccount: feePayer,
    network: networkPassphrase,
    warnings,
  };
}

/**
 * Format a SimulationResult for human-readable CLI output.
 */
export function formatSimulationResult(result: SimulationResult): string {
  const lines: string[] = [];
  lines.push("──────────────────────────────────────────────────");
  lines.push(result.success ? "✅  Simulation SUCCESSFUL" : "❌  Simulation FAILED");
  lines.push("──────────────────────────────────────────────────");

  if (!result.success) {
    lines.push(`Error: ${result.error}`);
    return lines.join("\n");
  }

  lines.push(`Inner Tx Hash : ${result.innerTxHash}`);
  lines.push(`Fee Account   : ${result.feeAccount}`);
  lines.push(`Estimated Fee : ${result.estimatedFee} stroops`);
  lines.push(`Network       : ${result.network}`);

  if (result.feeBumpXdr) {
    lines.push(`Fee-Bump XDR  :`);
    lines.push(result.feeBumpXdr);
  }

  if (result.warnings.length > 0) {
    lines.push("⚠️  Warnings:");
    result.warnings.forEach((w) => lines.push(`  • ${w}`));
  }

  lines.push("──────────────────────────────────────────────────");
  lines.push("(NOT submitted to the network)");
  return lines.join("\n");
}
