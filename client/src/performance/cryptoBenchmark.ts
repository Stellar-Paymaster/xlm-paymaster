import { Keypair } from "@stellar/stellar-sdk";
import { sign_transaction } from "../wasm/signing_wasm";

export interface BenchmarkResult {
  nativeNodeMs: number;
  wasmMs: number;
  winner: string;
}

/**
 * Runs a benchmark comparing Native Node crypto (via stellar-sdk)
 * vs WASM crypto implementation.
 */
export async function runCryptoBenchmark(iterations: number = 10): Promise<BenchmarkResult> {
  const dummyData = Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex");
  const dummyXdr = "AAAAAgAAAABnAwc3"; // Dummy XDR for WASM mock
  const keypair = Keypair.random();
  const secretKey = keypair.secret();
  
  // Benchmark Native Node (Stellar SDK)
  const startNative = performance.now();
  for (let i = 0; i < iterations; i++) {
    keypair.sign(dummyData);
  }
  const nativeNodeMs = performance.now() - startNative;

  // Benchmark WASM
  const startWasm = performance.now();
  for (let i = 0; i < iterations; i++) {
    sign_transaction(dummyXdr, secretKey);
  }
  const wasmMs = performance.now() - startWasm;

  const winner = wasmMs < nativeNodeMs ? "WASM" : "Native Node";

  return {
    nativeNodeMs,
    wasmMs,
    winner,
  };
}
