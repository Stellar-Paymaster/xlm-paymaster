import { Asset, Operation, Transaction } from "@stellar/stellar-sdk";
import { Config, pickFeePayerAccount } from "../config";
import { SettlementRequirement } from "./settlementVerifier";

type StellarOperation = Transaction["operations"][number];

const TRADE_LIKE_OPERATION_TYPES = new Set([
  "pathPaymentStrictReceive",
  "pathPaymentStrictSend",
  "manageBuyOffer",
  "manageSellOffer",
  "createPassiveSellOffer",
  "liquidityPoolDeposit",
  "liquidityPoolWithdraw",
]);

export interface SettlementAnalysisResult {
  isAllowed: boolean;
  findings: string[];
  warnings: string[];
  settlementOperationIndex?: number;
}

export function analyzeSettlementTransaction(
  innerTransaction: Transaction,
  requirement: SettlementRequirement,
  config: Config,
): SettlementAnalysisResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  const feePayerPublicKey = pickFeePayerAccount(config).publicKey;
  const expectedAsset = parseAsset(requirement.token);

  if (!expectedAsset) {
    return {
      isAllowed: false,
      findings: [`Invalid settlement token format: ${requirement.token}`],
      warnings,
    };
  }

  const settlementCandidates = innerTransaction.operations
    .map((operation, index) => ({ operation, index }))
    .filter(({ operation }) =>
      isSettlementDestinationOperation(operation, feePayerPublicKey, expectedAsset),
    );

  if (settlementCandidates.length !== 1) {
    findings.push(
      settlementCandidates.length === 0
        ? "No settlement operation targets the configured fee payer"
        : "Settlement payment is part of a larger atomic circuit with multiple fee-payer transfers",
    );

    return {
      isAllowed: false,
      findings,
      warnings,
    };
  }

  const [{ operation: settlementOperation, index: settlementOperationIndex }] =
    settlementCandidates;

  const previousOperation =
    settlementOperationIndex > 0
      ? innerTransaction.operations[settlementOperationIndex - 1]
      : undefined;
  const nextOperation =
    settlementOperationIndex < innerTransaction.operations.length - 1
      ? innerTransaction.operations[settlementOperationIndex + 1]
      : undefined;

  const previousLooksLikeTrade = isPotentialSandwichLeg(
    previousOperation,
    expectedAsset,
  );
  const nextLooksLikeTrade = isPotentialSandwichLeg(nextOperation, expectedAsset);

  if (previousLooksLikeTrade && nextLooksLikeTrade) {
    findings.push(
      "Suspicious trade activity appears immediately before and after the fee settlement",
    );
  } else if (previousLooksLikeTrade || nextLooksLikeTrade) {
    warnings.push(
      "Adjacent trade or liquidity activity detected near the fee settlement, but the pattern does not match a full sandwich",
    );
  }

  if (
    isLiquidityPoolOperation(previousOperation) &&
    nextLooksLikeTrade
  ) {
    findings.push(
      "Settlement is adjacent to liquidity-pool activity and a follow-up trade, which matches a sandwich-style liquidity manipulation pattern",
    );
  }

  if (
    isLiquidityPoolOperation(nextOperation) &&
    previousLooksLikeTrade
  ) {
    findings.push(
      "Settlement is adjacent to liquidity-pool activity and a leading trade, which matches a sandwich-style liquidity manipulation pattern",
    );
  }

  if (
    settlementOperationIndex > 0 &&
    settlementOperationIndex < innerTransaction.operations.length - 1 &&
    countTradeLikeOperations(innerTransaction.operations, expectedAsset) >= 2
  ) {
    warnings.push(
      "Settlement is embedded inside a multi-step atomic transaction with multiple trade-like operations",
    );
  }

  return {
    isAllowed: findings.length === 0,
    findings,
    warnings,
    settlementOperationIndex,
  };
}

function parseAsset(token: string): Asset | null {
  if (token === "XLM" || token === "native") {
    return Asset.native();
  }

  const [code, issuer] = token.split(":");
  if (!code || !issuer) {
    return null;
  }

  return new Asset(code, issuer);
}

function isSettlementDestinationOperation(
  operation: StellarOperation,
  destination: string,
  expectedAsset: Asset,
): boolean {
  if (!("destination" in operation) || operation.destination !== destination) {
    return false;
  }

  switch (operation.type) {
    case "payment":
      return assetsEqual(operation.asset, expectedAsset);
    case "pathPaymentStrictReceive":
    case "pathPaymentStrictSend":
      return assetsEqual(operation.destAsset, expectedAsset);
    default:
      return false;
  }
}

function isPotentialSandwichLeg(
  operation: StellarOperation | undefined,
  expectedAsset: Asset,
): boolean {
  if (!operation || !TRADE_LIKE_OPERATION_TYPES.has(operation.type)) {
    return false;
  }

  if (isLiquidityPoolOperation(operation)) {
    return true;
  }

  return operationTouchesAsset(operation, expectedAsset);
}

function countTradeLikeOperations(
  operations: StellarOperation[],
  expectedAsset: Asset,
): number {
  return operations.filter((operation) => {
    return isPotentialSandwichLeg(operation, expectedAsset);
  }).length;
}

function isLiquidityPoolOperation(operation: StellarOperation | undefined): boolean {
  return (
    operation?.type === "liquidityPoolDeposit" ||
    operation?.type === "liquidityPoolWithdraw"
  );
}

function operationTouchesAsset(
  operation: StellarOperation,
  expectedAsset: Asset,
): boolean {
  const candidateAssets: Asset[] = [];

  if ("asset" in operation && operation.asset instanceof Asset) {
    candidateAssets.push(operation.asset);
  }

  if ("sendAsset" in operation && operation.sendAsset instanceof Asset) {
    candidateAssets.push(operation.sendAsset);
  }

  if ("destAsset" in operation && operation.destAsset instanceof Asset) {
    candidateAssets.push(operation.destAsset);
  }

  if ("buying" in operation && operation.buying instanceof Asset) {
    candidateAssets.push(operation.buying);
  }

  if ("selling" in operation && operation.selling instanceof Asset) {
    candidateAssets.push(operation.selling);
  }

  if ("path" in operation && Array.isArray(operation.path)) {
    for (const asset of operation.path) {
      if (asset instanceof Asset) {
        candidateAssets.push(asset);
      }
    }
  }

  return candidateAssets.some((asset) => assetsEqual(asset, expectedAsset));
}

function assetsEqual(asset1: Asset, asset2: Asset): boolean {
  if (asset1.isNative() && asset2.isNative()) {
    return true;
  }

  if (asset1.isNative() || asset2.isNative()) {
    return false;
  }

  return (
    asset1.getCode() === asset2.getCode() &&
    asset1.getIssuer() === asset2.getIssuer()
  );
}
