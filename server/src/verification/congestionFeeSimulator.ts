#!/usr/bin/env ts-node
/**
 * Congestion Simulator for Dynamic Fee Assertions (#731)
 *
 * Simulates network congestion via configurable Horizon fee_stats responses,
 * drives FeeManager polling, and verifies Node/Rust fee-bump parity.
 *
 * Usage:
 *   npx ts-node src/verification/congestionFeeSimulator.ts
 *   npm run congestion:simulate
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { calculateFeeBumpFee } from "../utils/feeCalculator";
import {
  calculateRustFeeBumpAmount,
  calculateRustOuterFee,
  CONGESTION_SCENARIOS,
  deriveMultiplierFromFeeStats,
} from "../utils/feeParity";
import { Config } from "../config";
import { initializeFeeManager, resetFeeManagerForTests } from "../services/feeManager";

const BASE_FEE = 100;
const OPERATION_COUNTS = [0, 1, 3, 5];

interface SimulationResult {
  scenario: string;
  p70: number;
  p95: number;
  multiplier: number;
  congestionLevel: string;
  nodeFees: Record<number, number>;
  rustFees: Record<number, number>;
  parityOk: boolean;
}

function buildFeeStatsResponse(p70: number, p95: number) {
  return {
    last_ledger: "999999",
    last_ledger_base_fee: String(BASE_FEE),
    ledger_capacity_usage: "0.75",
    fee_charged: { p70: String(p70), p95: String(p95) },
    max_fee: { p70: String(p70), p95: String(p95) },
  };
}

function startMockHorizon(
  p70: number,
  p95: number,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url?.includes("/fee_stats")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(buildFeeStatsResponse(p70, p95)));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

async function runScenario(
  scenario: (typeof CONGESTION_SCENARIOS)[number],
): Promise<SimulationResult> {
  const mock = await startMockHorizon(scenario.p70, scenario.p95);

  resetFeeManagerForTests();
  const config = {
    baseFee: BASE_FEE,
    feeMultiplier: 2.0,
    horizonUrl: mock.url,
  } as Config;

  const feeManager = initializeFeeManager(config);
  await feeManager.pollOnce();

  const snapshot = feeManager.getSnapshot();
  const derived = deriveMultiplierFromFeeStats(scenario.p70, scenario.p95, BASE_FEE);

  const nodeFees: Record<number, number> = {};
  const rustFees: Record<number, number> = {};
  let parityOk = true;

  for (const ops of OPERATION_COUNTS) {
    const nodeFee = calculateFeeBumpFee(ops, BASE_FEE, snapshot.multiplier);
    const rustFee = calculateRustFeeBumpAmount(ops, BASE_FEE, snapshot.multiplier);
    const rustOuter = calculateRustOuterFee(ops, BASE_FEE, snapshot.multiplier);

    nodeFees[ops] = nodeFee;
    rustFees[ops] = rustFee;

    if (nodeFee !== rustFee) {
      parityOk = false;
      console.error(
        `  PARITY MISMATCH ops=${ops}: Node=${nodeFee}, Rust=${rustFee}, outer=${rustOuter}`,
      );
    }
  }

  resetFeeManagerForTests();
  await mock.close();

  return {
    scenario: scenario.name,
    p70: scenario.p70,
    p95: scenario.p95,
    multiplier: snapshot.multiplier,
    congestionLevel: snapshot.congestionLevel,
    nodeFees,
    rustFees,
    parityOk:
      parityOk &&
      snapshot.multiplier === derived.multiplier &&
      snapshot.congestionLevel === derived.congestionLevel,
  };
}

async function main(): Promise<void> {
  console.log("=== Congestion Fee Simulator (#731) ===\n");
  console.log(`Base fee: ${BASE_FEE} stroops`);
  console.log(`Threshold: max(p70,p95)/baseFee >= 4 → multiplier 2.0\n`);

  const results: SimulationResult[] = [];
  let allPassed = true;

  for (const scenario of CONGESTION_SCENARIOS) {
    console.log(`Running scenario: ${scenario.name} (p70=${scenario.p70}, p95=${scenario.p95})`);
    const result = await runScenario(scenario);
    results.push(result);

    const status = result.parityOk ? "PASS" : "FAIL";
    console.log(
      `  ${status} | congestion=${result.congestionLevel} multiplier=${result.multiplier}`,
    );
    for (const ops of OPERATION_COUNTS) {
      console.log(
        `    ops=${ops}: Node=${result.nodeFees[ops]} Rust=${result.rustFees[ops]}`,
      );
    }
    console.log();

    if (!result.parityOk) allPassed = false;
  }

  console.log("=== Summary ===");
  console.log(`Scenarios: ${results.length}`);
  console.log(`Passed: ${results.filter((r) => r.parityOk).length}`);
  console.log(`Failed: ${results.filter((r) => !r.parityOk).length}`);
  console.log(allPassed ? "\nAll congestion scenarios passed." : "\nSome scenarios failed.");

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Simulator error:", err);
  process.exit(1);
});
