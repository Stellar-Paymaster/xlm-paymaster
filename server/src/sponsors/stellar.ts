import StellarSdk, { Transaction } from "@stellar/stellar-sdk";
import { Config, FeePayerAccount } from "../config";
import { AppError } from "../errors/AppError";
import { Tenant } from "../models/tenantStore";
import { recordSponsoredTransaction } from "../models/transactionLedger";
import { calculateFeeBumpFee } from "../utils/feeCalculator";
import { transactionMilestoneService } from "../services/discordMilestones";
import { transactionStore } from "../workers/transactionStore";
import { prisma } from "../utils/db";
import { classifyTransactionCategory } from "../services/transactionCategorizer";
import { getFeeManager } from "../services/feeManager";
import { FeeSponsor, SponsorResponse } from "./base";
import { screenAddresses, logScreeningResult } from "../services/ofacScreening";
import { extractAddresses } from "../utils/stellarAddressExtractor";
import { evaluateSARRules } from "../services/sarService";
import { signTransaction, signTransactionWithVault } from "../signing";
import {
  extractSettlementRequirement,
  verifySettlementPayment,
} from "../utils/settlementVerifier";
import { analyzeSettlementTransaction } from "../utils/settlementTransactionAnalyzer";

export interface StellarSponsorParams {
  xdr: string;
  submit: boolean;
  config: Config;
  tenant: Tenant;
  feePayerAccount: FeePayerAccount;
  token?: string;
}

export class StellarFeeSponsor implements FeeSponsor {
  async estimateFee(params: StellarSponsorParams): Promise<bigint> {
    const { xdr, config } = params;
    let innerTransaction: Transaction;

    try {
      innerTransaction = StellarSdk.TransactionBuilder.fromXDR(
        xdr,
        config.networkPassphrase
      ) as Transaction;
    } catch (error: any) {
      throw new AppError(`Invalid XDR: ${error.message}`, 400, "INVALID_XDR");
    }

    const dynamicFeeMultiplier =
      getFeeManager()?.getMultiplier() ?? config.feeMultiplier;
    return BigInt(calculateFeeBumpFee(
      innerTransaction,
      config.baseFee,
      dynamicFeeMultiplier
    ));
  }

  async buildSponsoredTx(params: StellarSponsorParams): Promise<SponsorResponse> {
    const { xdr, submit, config, tenant, feePayerAccount } = params;
    let innerTransaction: Transaction;

    try {
      innerTransaction = StellarSdk.TransactionBuilder.fromXDR(
        xdr,
        config.networkPassphrase
      ) as Transaction;
    } catch (error: any) {
      throw new AppError(`Invalid XDR: ${error.message}`, 400, "INVALID_XDR");
    }

    if (!innerTransaction.signatures || innerTransaction.signatures.length === 0) {
      throw new AppError(
        "Inner transaction must be signed before fee-bumping",
        400,
        "UNSIGNED_TRANSACTION"
      );
    }

    if ("innerTransaction" in innerTransaction) {
      throw new AppError(
        "Cannot fee-bump an already fee-bumped transaction",
        400,
        "ALREADY_FEE_BUMPED"
      );
    }

    // OFAC sanctions screening — check all destination addresses before proceeding
    const addresses = extractAddresses(innerTransaction);
    const screeningResult = screenAddresses(addresses);
    const innerTxHashForAudit = innerTransaction.hash().toString("hex");
    logScreeningResult(innerTxHashForAudit, tenant.id, screeningResult).catch(() => {});

    if (screeningResult.blocked) {
      throw new AppError(
        `Transaction rejected: destination address matches OFAC SDN list`,
        451,
        "SANCTIONED_ADDRESS"
      );
    }

    const feeAmount = await this.estimateFee(params);
    const settlementRequirement = extractSettlementRequirement(
      params.token,
      Number(feeAmount),
    );

    if (settlementRequirement) {
      const settlementVerification = verifySettlementPayment(
        innerTransaction,
        settlementRequirement,
        config,
      );

      if (!settlementVerification.isValid) {
        throw new AppError(
          settlementVerification.reason ?? "Invalid fee settlement payment",
          400,
          "SETTLEMENT_VERIFICATION_FAILED",
        );
      }

      const settlementAnalysis = analyzeSettlementTransaction(
        innerTransaction,
        settlementRequirement,
        config,
      );

      if (!settlementAnalysis.isAllowed) {
        throw new AppError(
          settlementAnalysis.findings.join("; "),
          400,
          "SETTLEMENT_VERIFICATION_FAILED",
        );
      }
    }

    const category = classifyTransactionCategory(
      innerTransaction.operations as Array<{ type?: string }>
    );

    const innerTxHash = innerTransaction.hash().toString("hex");

    // Create transaction record with PENDING status
    const transactionRecord = await prisma.transaction.create({
      data: {
        innerTxHash,
        tenantId: tenant.id,
        status: "PENDING",
        costStroops: Number(feeAmount),
        category,
      },
    });

    try {
      const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
        feePayerAccount.keypair,
        feeAmount.toString(),
        innerTransaction,
        config.networkPassphrase
      );

      switch (feePayerAccount.secretSource.type) {
        case "vault":
          if (!config.vault) {
            throw new AppError(
              "Vault-backed fee payer selected but VAULT_* configuration is missing",
              500,
              "INTERNAL_ERROR",
            );
          }

          await signTransactionWithVault(
            feeBumpTx as unknown as {
              addDecoratedSignature(signature: unknown): void;
              hash(): Buffer;
            },
            feePayerAccount.publicKey,
            config.vault,
            feePayerAccount.secretSource.secretPath,
            config,
          );
          break;
        case "env":
          await signTransaction(
            feeBumpTx as unknown as {
              addDecoratedSignature(signature: unknown): void;
              hash(): Buffer;
            },
            feePayerAccount.secretSource.secret,
            config,
          );
          break;
        default:
          throw new AppError(
            `Unsupported fee payer secret source: ${feePayerAccount.secretSource.type}`,
            500,
            "INTERNAL_ERROR",
          );
      }
      await recordSponsoredTransaction(tenant.id, Number(feeAmount));

      // Evaluate SAR rules synchronously during fee-bump (fire-and-forget to avoid blocking)
      evaluateSARRules(
        transactionRecord.id,
        tenant.id,
        Number(feeAmount),
        category
      ).catch(err => console.error("SAR evaluation error:", err));

      try {
        await transactionMilestoneService.checkForMilestones();
      } catch (error) {
        console.error("Discord milestone check failed:", error);
      }

      const feeBumpXdr = feeBumpTx.toXDR();
      const feeBumpTxHash = feeBumpTx.hash().toString("hex");

      if (submit && config.horizonUrl) {
        const server = new StellarSdk.Horizon.Server(config.horizonUrl);

        try {
          const submissionResult = await server.submitTransaction(feeBumpTx);
          await transactionStore.addTransaction(submissionResult.hash, tenant.id, "submitted");

          await prisma.transaction.update({
            where: { id: transactionRecord.id },
            data: {
              status: "SUCCESS",
              txHash: submissionResult.hash,
            },
          });

          return {
            tx: feeBumpXdr,
            status: "submitted",
            hash: submissionResult.hash,
            feePayer: feePayerAccount.publicKey,
          };
        } catch (error: any) {
          console.error("Transaction submission failed:", error);

          await prisma.transaction.update({
            where: { id: transactionRecord.id },
            data: {
              status: "FAILED",
            },
          });

          throw new AppError(
            `Transaction submission failed: ${error.message}`,
            500,
            "SUBMISSION_FAILED"
          );
        }
      }

      await prisma.transaction.update({
        where: { id: transactionRecord.id },
        data: {
          status: "SUCCESS",
          txHash: feeBumpTxHash,
        },
      });

      return {
        tx: feeBumpXdr,
        status: submit ? "submitted" : "ready",
        feePayer: feePayerAccount.publicKey,
      };
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: transactionRecord.id },
        data: {
          status: "FAILED",
        },
      });

      throw error;
    }
  }
}
