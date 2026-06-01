import { Asset, Operation, Transaction } from "@stellar/stellar-sdk";
import { Config, pickFeePayerAccount } from "../config";

export interface SettlementVerificationResult {
  isValid: boolean;
  reason?: string;
  expectedAmount?: string;
  actualAmount?: string;
  assetCode?: string;
}

export interface SettlementRequirement {
  token: string;
  requiredAmountStroops: number;
}

/**
 * Verifies that an inner transaction includes a proper settlement payment
 * to the Fluid node's fee payer account in the specified token.
 */
export function verifySettlementPayment(
  innerTransaction: Transaction,
  requirement: SettlementRequirement,
  config: Config,
): SettlementVerificationResult {
  const feePayerAccount = pickFeePayerAccount(config);
  const feePayerPublicKey = feePayerAccount.publicKey;

  console.log(
    `Verifying settlement payment | fee_payer: ${feePayerPublicKey} | token: ${requirement.token} | required_amount: ${requirement.requiredAmountStroops} stroops`,
  );

  // Parse the required token asset
  let expectedAsset: Asset;
  try {
    if (requirement.token === "XLM" || requirement.token === "native") {
      expectedAsset = Asset.native();
    } else {
      // Assume non-native tokens are in format "CODE:ISSUER"
      const parts = requirement.token.split(":");
      if (parts.length !== 2) {
        return {
          isValid: false,
          reason: `Invalid token format: ${requirement.token}. Expected format "CODE:ISSUER" for non-native tokens`,
        };
      }
      expectedAsset = new Asset(parts[0], parts[1]);
    }
  } catch (error) {
    return {
      isValid: false,
      reason: `Failed to parse token asset: ${requirement.token}`,
    };
  }

  const settlementOperations = innerTransaction.operations.filter((op) => {
    return isSettlementOperation(op, feePayerPublicKey, expectedAsset);
  });

  if (settlementOperations.length === 0) {
    const strictSendSettlement = innerTransaction.operations.find((op) => {
      return isStrictSendSettlementOperation(op, feePayerPublicKey, expectedAsset);
    });

    if (strictSendSettlement) {
      return {
        isValid: false,
        reason:
          "Settlement path payment must use pathPaymentStrictReceive so the fee payer receives the exact expected amount",
      };
    }

    return {
      isValid: false,
      reason: `No settlement payment found to fee payer ${feePayerPublicKey} in token ${requirement.token}`,
    };
  }

  if (settlementOperations.length > 1) {
    return {
      isValid: false,
      reason: "Multiple settlement operations found; expected exactly one settlement payment",
    };
  }

  const settlementOp = settlementOperations[0];
  const paymentAmount = getOperationAmount(settlementOp);

  if (!paymentAmount) {
    return {
      isValid: false,
      reason: "Could not extract payment amount from settlement operation",
    };
  }

  // Convert amount to stroops for comparison
  const paymentAmountStroops = Math.floor(
    parseFloat(paymentAmount) * 10_000_000,
  );

  if (paymentAmountStroops !== requirement.requiredAmountStroops) {
    return {
      isValid: false,
      reason: "Incorrect settlement amount",
      expectedAmount: (
        requirement.requiredAmountStroops / 10_000_000
      ).toString(),
      actualAmount: paymentAmount,
      assetCode: requirement.token,
    };
  }

  console.log(
    `Settlement payment verified | amount: ${paymentAmount} ${requirement.token} | fee_payer: ${feePayerPublicKey}`,
  );

  return {
    isValid: true,
    actualAmount: paymentAmount,
    assetCode: requirement.token,
  };
}

/**
 * Checks if an operation is a settlement payment to the specified destination
 * in the expected asset.
 */
function isSettlementOperation(
  operation: Operation,
  destination: string,
  expectedAsset: Asset,
): boolean {
  switch (operation.type) {
    case "payment":
      return (
        operation.destination === destination &&
        assetsEqual(operation.asset, expectedAsset)
      );

    case "pathPaymentStrictReceive":
      return (
        operation.destination === destination &&
        assetsEqual(operation.destAsset, expectedAsset)
      );

    default:
      return false;
  }
}

function isStrictSendSettlementOperation(
  operation: Operation,
  destination: string,
  expectedAsset: Asset,
): boolean {
  return (
    operation.type === "pathPaymentStrictSend" &&
    operation.destination === destination &&
    assetsEqual(operation.destAsset, expectedAsset)
  );
}

/**
 * Extracts the payment amount from different operation types.
 */
function getOperationAmount(operation: Operation): string | null {
  switch (operation.type) {
    case "payment":
      return operation.amount;

    case "pathPaymentStrictReceive":
      return operation.destAmount;

    default:
      return null;
  }
}

/**
 * Compares two Stellar assets for equality.
 */
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

/**
 * Extracts token requirement from the fee bump request.
 * If no token is specified, returns null (no settlement required).
 */
export function extractSettlementRequirement(
  token?: string,
  feeAmountStroops?: number,
): SettlementRequirement | null {
  if (!token) {
    return null;
  }

  // For now, we'll use a simple 1:1 conversion for non-XLM tokens
  // In a real implementation, this should use current market prices
  const requiredAmountStroops = feeAmountStroops || 100; // Default to 0.00001 XLM equivalent

  return {
    token,
    requiredAmountStroops,
  };
}
