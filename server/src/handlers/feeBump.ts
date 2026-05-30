import StellarSdk, { Transaction } from "@stellar/stellar-sdk";
import { createHash } from "crypto";
import { Config, FeePayerAccount, pickFeePayerAccount } from "../config";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { ApiKeyConfig } from "../middleware/apiKeys";
import { runPlugins } from "../middleware/pluginMiddleware";
import { Tenant, syncTenantFromApiKey } from "../models/tenantStore";
import { recordSponsoredTransaction } from "../models/transactionLedger";
import {
  FeeBumpRequest,
  FeeBumpSchema,
  FeeBumpBatchRequest,
  FeeBumpBatchSchema,
} from "../schemas/feeBump";
import { checkTenantDailyQuota } from "../services/quota";
import { calculateFeeBumpFee } from "../utils/feeCalculator";
import { verifyXdrNetwork } from "../utils/networkVerification";
import { MockPriceOracle, validateSlippage } from "../utils/priceOracle";
import { priceService } from "../services/priceService";
import { transactionMilestoneService } from "../services/discordMilestones";
import { transactionStore } from "../workers/transactionStore";
import { prisma } from "../utils/db";
import { classifyTransactionCategory } from "../services/transactionCategorizer";
import { getFeeManager } from "../services/feeManager";
import {
  getCrossChainSettlementService,
  SettlementExecutor,
} from "../services/crossChainSettlement";
import { enforceKycForFeeSponsorship } from "../services/kycService";
import { SponsorFactory } from "../sponsors/factory";
import { StellarFeeSponsor } from "../sponsors/stellar";
import { nativeSigner } from "../signing/native";
import {
  feeBumpQueue,
  feeBumpQueueEvents,
  FeeBumpJobData,
} from "../queues/feeBumpQueue";
import { getFcmNotifier } from "../services/fcmNotifier";

const FEEBUMP_JOB_TIMEOUT_MS = parseInt(
  process.env.FEEBUMP_JOB_TIMEOUT_MS ?? "30000",
  10,
);

export interface FeeBumpResponse {
  xdr: string;
  status: "ready" | "submitted" | "awaiting_evm_payment";
  hash?: string;
  fee_payer: string;
  settlement_id?: string;
  evm_payment?: {
    chain_id: number;
    token_address: string;
    amount: string;
    payer_address: string;
    recipient_address: string;
    confirmations_required: number;
  };
  submitted_via?: string;
  submission_attempts?: number;
}

interface PreparedFeeBump {
  innerTransaction: Transaction;
  feeAmount: number;
  category: string;
  innerTxHash: string;
}

async function maybeNotifyMilestones(): Promise<void> {
  try {
    await transactionMilestoneService.checkForMilestones();
  } catch (error) {
    console.error("Discord milestone check failed:", error);
  }
}

function parseInnerTransaction(xdr: string, config: Config): Transaction {
  let innerTransaction: Transaction;

  try {
    innerTransaction = StellarSdk.TransactionBuilder.fromXDR(
      xdr,
      config.networkPassphrase,
    ) as Transaction;
  } catch (error: any) {
    throw new AppError(`Invalid XDR: ${error.message}`, 400, "INVALID_XDR");
  }

  if (
    !innerTransaction.signatures ||
    innerTransaction.signatures.length === 0
  ) {
    throw new AppError(
      "Inner transaction must be signed before fee-bumping",
      400,
      "UNSIGNED_TRANSACTION",
    );
  }

  if ("innerTransaction" in innerTransaction) {
    throw new AppError(
      "Cannot fee-bump an already fee-bumped transaction",
      400,
      "ALREADY_FEE_BUMPED",
    );
  }

  return innerTransaction;
}

function prepareFeeBump(xdr: string, config: Config): PreparedFeeBump {
  const innerTransaction = parseInnerTransaction(xdr, config);
  const dynamicFeeMultiplier =
    getFeeManager()?.getMultiplier() ?? config.feeMultiplier;
  const feeAmount = calculateFeeBumpFee(
    innerTransaction,
    config.baseFee,
    dynamicFeeMultiplier,
  );
  const category = classifyTransactionCategory(
    innerTransaction.operations as Array<{ type?: string }>,
  );
  const innerTxHash = innerTransaction.hash().toString("hex");

  return {
    innerTransaction,
    feeAmount,
    category,
    innerTxHash,
  };
}

function fingerprintSponsorshipRequest(value: unknown): string {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value ?? null);
  return createHash("sha256").update(serialized).digest("hex");
}

async function createPendingTransactionRecord(
  tenantId: string,
  prepared: PreparedFeeBump,
): Promise<{ id: string }> {
  return prisma.transaction.create({
    data: {
      innerTxHash: prepared.innerTxHash,
      tenantId,
      status: "PENDING",
      costStroops: prepared.feeAmount,
      category: prepared.category,
    },
  });
}

async function executePreparedFeeBump(
  xdr: string,
  submit: boolean,
  config: Config,
  tenantId: string,
  feePayerAccount: FeePayerAccount,
  transactionRecordId: string,
  shadowMode?: boolean,
): Promise<FeeBumpResponse> {
  const innerTransaction = parseInnerTransaction(xdr, config);
  const dynamicFeeMultiplier =
    getFeeManager()?.getMultiplier() ?? config.feeMultiplier;
  const feeAmount = calculateFeeBumpFee(
    innerTransaction,
    config.baseFee,
    dynamicFeeMultiplier,
  );
  const innerTxHash = innerTransaction.hash().toString("hex");

  if (shadowMode || process.env.SHADOW_MODE === "true") {
    await prisma.transaction.update({
      where: { id: transactionRecordId },
      data: {
        status: "SHADOW",
        txHash: "shadow_" + innerTxHash,
      },
    });

    return {
      xdr: xdr,
      status: submit ? "submitted" : "ready",
      hash: "shadow_" + innerTxHash,
      fee_payer: feePayerAccount.publicKey,
    };
  }

  try {
    const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      feePayerAccount.keypair,
      feeAmount.toString(),
      innerTransaction,
      config.networkPassphrase,
    );

    feeBumpTx.sign(feePayerAccount.keypair);
    await recordSponsoredTransaction(tenantId, feeAmount);
    await maybeNotifyMilestones();

    const feeBumpXdr = feeBumpTx.toXDR();
    const feeBumpTxHash = feeBumpTx.hash().toString("hex");

    if (submit && config.horizonUrl) {
      const server = new StellarSdk.Horizon.Server(config.horizonUrl);

      try {
        const submissionResult = await server.submitTransaction(feeBumpTx);
        await transactionStore.addTransaction(
          submissionResult.hash,
          tenantId,
          "submitted",
        );

        await prisma.transaction.update({
          where: { id: transactionRecordId },
          data: {
            status: "SUCCESS",
            txHash: submissionResult.hash,
          },
        });

        const fcm = getFcmNotifier();
        if (fcm) {
          fcm
            .notifyTransactionSuccess({
              transactionHash: submissionResult.hash,
              tenantId,
              detail: "Transaction successfully sponsored and submitted.",
            })
            .catch(console.error);
        }

        return {
          xdr: feeBumpXdr,
          status: "submitted",
          hash: submissionResult.hash,
          fee_payer: feePayerAccount.publicKey,
        };
      } catch (error: any) {
        console.error("Transaction submission failed:", error);

        await prisma.transaction.update({
          where: { id: transactionRecordId },
          data: {
            status: "FAILED",
          },
        });

        throw new AppError(
          `Transaction submission failed: ${error.message}`,
          500,
          "SUBMISSION_FAILED",
        );
      }
    }

    await prisma.transaction.update({
      where: { id: transactionRecordId },
      data: {
        status: "SUCCESS",
        txHash: feeBumpTxHash,
      },
    });

    return {
      xdr: feeBumpXdr,
      status: submit ? "submitted" : "ready",
      fee_payer: feePayerAccount.publicKey,
    };
  } catch (error: any) {
    await prisma.transaction.update({
      where: { id: transactionRecordId },
      data: {
        status: "FAILED",
      },
    });

    throw error;
  }
}

function createSettlementExecutor(config: Config): SettlementExecutor {
  return {
    async execute(input) {
      await executePreparedFeeBump(
        input.xdr,
        input.submit,
        config,
        input.tenantId,
        input.feePayerAccount,
        input.transactionId,
      );
    },
  };
}

export async function processFeeBump(
  xdr: string,
  submit: boolean,
  config: Config,
  tenant: Tenant,
  feePayerAccount: FeePayerAccount,
  shadowMode?: boolean,
): Promise<FeeBumpResponse> {
  const prepared = prepareFeeBump(xdr, config);
  const quotaCheck = await checkTenantDailyQuota(tenant, prepared.feeAmount);
  if (!quotaCheck.allowed) {
    throw new AppError(
      `Tier limit exceeded. Spend ${quotaCheck.currentSpendStroops}/${quotaCheck.dailyQuotaStroops} stroops and transactions ${quotaCheck.currentTxCount}/${quotaCheck.txLimit} today.`,
      403,
      "QUOTA_EXCEEDED",
    );
  }
  const transactionRecord = await createPendingTransactionRecord(
    tenant.id,
    prepared,
  );

  return executePreparedFeeBump(
    xdr,
    submit,
    config,
    tenant.id,
    feePayerAccount,
    transactionRecord.id,
    shadowMode,
  );
}

export async function feeBumpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config,
): Promise<void> {
  try {
    const result = FeeBumpSchema.safeParse(req.body);

    if (!result.success) {
      return next(
        new AppError(
          `Validation failed: ${JSON.stringify(result.error.format())}`,
          400,
          "INVALID_XDR",
        ),
      );
    }

    const body: FeeBumpRequest = result.data;
    const chainId = body.chainId || "stellar";
    const sponsor = SponsorFactory.getSponsor(chainId as any);

    const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;
    if (!apiKeyConfig) {
      res
        .status(500)
        .json({ error: "Missing tenant context for fee sponsorship" });
      return;
    }

    const tenant = syncTenantFromApiKey(apiKeyConfig);
    const feePayerAccount = pickFeePayerAccount(config);

    const pluginCtx = await runPlugins(req, {
      tenantId: tenant.id,
      chainId,
      xdr: body.xdr,
      submit: body.submit,
    });

    const effectiveXdr = pluginCtx.xdr ?? body.xdr;
    const effectiveSubmit = pluginCtx.submit ?? body.submit;

    const shadowMode =
      req.headers["x-shadow-mode"] === "true" ||
      req.body.shadowMode === true ||
      process.env.SHADOW_MODE === "true";

    let params: any = {
      ...body,
      xdr: effectiveXdr,
      submit: effectiveSubmit,
      config,
      tenant,
      feePayerAccount,
      shadowMode,
    };

    await enforceKycForFeeSponsorship(config, {
      chainId,
      requestId: req.header("x-request-id") ?? undefined,
      tenant,
      transactionHash: fingerprintSponsorshipRequest(
        effectiveXdr ?? body.userOp ?? body.transactionB64,
      ),
    });

    if (chainId === "stellar") {
      if (!effectiveXdr) {
        throw new AppError("Stellar requires xdr field", 400, "INVALID_XDR");
      }

      const networkCheck = verifyXdrNetwork(
        effectiveXdr,
        config.networkPassphrase,
      );
      if (!networkCheck.valid) {
        throw new AppError(
          networkCheck.errorMessage ?? "Network mismatch",
          400,
          "NETWORK_MISMATCH",
        );
      }

      let innerTransaction: any;
      try {
        innerTransaction = StellarSdk.TransactionBuilder.fromXDR(
          effectiveXdr,
          config.networkPassphrase,
        ) as any;
      } catch (error: any) {
        throw new AppError(`Invalid XDR: ${error.message}`, 400, "INVALID_XDR");
      }

      const isSoroban = innerTransaction.operations.some((op: any) =>
        [
          "invokeHostFunction",
          "extendFootprintTtl",
          "restoreFootprint",
        ].includes(op.type),
      );

      if (isSoroban) {
        if (!config.stellarRpcUrl) {
          throw new AppError(
            "Soroban transaction requires STELLAR_RPC_URL for preflight simulation",
            400,
            "INVALID_XDR",
          );
        }

        try {
          const updatedXdr = await nativeSigner.preflightSoroban(
            config.stellarRpcUrl,
            effectiveXdr,
          );
          params = { ...params, xdr: updatedXdr };
        } catch (error: any) {
          throw new AppError(
            `Soroban simulation failed: ${error.message}. The transaction would fail on-chain or out of gas.`,
            400,
            "INVALID_XDR",
          );
        }
      }

      if (body.token) {
        const supportedAssets = config.supportedAssets ?? [];
        const isWhitelisted = supportedAssets.some((asset) => {
          const assetId = asset.issuer
            ? `${asset.code}:${asset.issuer}`
            : asset.code;
          return body.token === assetId;
        });

        if (!isWhitelisted) {
          throw new AppError(
            `Whitelisting failed: Asset "${body.token}" is not accepted for fee sponsorship.`,
            400,
            "UNSUPPORTED_ASSET",
          );
        }
      }
    }

    if (body.evmSettlement) {
      if (!config.evmSettlement?.enabled) {
        return next(
          new AppError(
            "EVM settlement is not enabled on this server.",
            400,
            "EVM_SETTLEMENT_DISABLED",
          ),
        );
      }

      if (body.evmSettlement.chainId !== config.evmSettlement.chainId) {
        return next(
          new AppError(
            `Unsupported EVM chain ${body.evmSettlement.chainId}. Expected chain ${config.evmSettlement.chainId}.`,
            400,
            "UNSUPPORTED_EVM_CHAIN",
          ),
        );
      }

      if (
        body.evmSettlement.tokenAddress.toLowerCase() !==
        config.evmSettlement.tokenAddress.toLowerCase()
      ) {
        return next(
          new AppError(
            "Unsupported EVM settlement token address.",
            400,
            "UNSUPPORTED_EVM_TOKEN",
          ),
        );
      }

      const prepared = prepareFeeBump(effectiveXdr, config);
      const quotaCheck = await checkTenantDailyQuota(
        tenant,
        prepared.feeAmount,
      );
      if (!quotaCheck.allowed) {
        return next(
          new AppError(
            `Tier limit exceeded. Spend ${quotaCheck.currentSpendStroops}/${quotaCheck.dailyQuotaStroops} stroops and transactions ${quotaCheck.currentTxCount}/${quotaCheck.txLimit} today.`,
            403,
            "QUOTA_EXCEEDED",
          ),
        );
      }

      const transactionRecord = await createPendingTransactionRecord(
        tenant.id,
        prepared,
      );
      const settlementService = getCrossChainSettlementService(
        config,
        createSettlementExecutor(config),
      );
      const settlement = await settlementService.enqueuePendingSettlement({
        transactionId: transactionRecord.id,
        tenantId: tenant.id,
        xdr: effectiveXdr,
        submit: effectiveSubmit || false,
        sourceChainId: body.evmSettlement.chainId,
        sourceTokenAddress: body.evmSettlement.tokenAddress,
        sourceAmount: body.evmSettlement.amount,
        payerAddress: body.evmSettlement.payerAddress,
        recipientAddress: config.evmSettlement.receiverAddress,
        confirmationsRequired: config.evmSettlement.confirmationsRequired,
        feePayerPublicKey: feePayerAccount.publicKey,
      });
      settlementService.ensureStarted();

      res.json({
        xdr: effectiveXdr,
        status: "awaiting_evm_payment",
        fee_payer: feePayerAccount.publicKey,
        settlement_id: settlement.settlementId,
        evm_payment: {
          chain_id: config.evmSettlement.chainId,
          token_address: config.evmSettlement.tokenAddress,
          amount: body.evmSettlement.amount,
          payer_address: body.evmSettlement.payerAddress.toLowerCase(),
          recipient_address: config.evmSettlement.receiverAddress.toLowerCase(),
          confirmations_required: config.evmSettlement.confirmationsRequired,
        },
      } satisfies FeeBumpResponse);
      return;
    }

    if (chainId !== "stellar") {
      const sponsored = await sponsor.buildSponsoredTx(params);
      res.json({
        xdr: sponsored.tx,
        status: sponsored.status,
        hash: sponsored.hash,
        fee_payer: sponsored.feePayer,
        submitted_via: sponsored.submittedVia,
      } satisfies FeeBumpResponse);
      return;
    }

    const job = await feeBumpQueue.add("submit", {
      xdr: params.xdr,
      submit: params.submit ?? false,
      tenant,
      requestId: req.header("x-request-id") ?? undefined,
      shadowMode: params.shadowMode,
    } satisfies FeeBumpJobData);

    let response: FeeBumpResponse;
    try {
      response = await job.waitUntilFinished(
        feeBumpQueueEvents,
        FEEBUMP_JOB_TIMEOUT_MS,
      );
    } catch (err: any) {
      if (err.message?.includes("timed out")) {
        res
          .status(504)
          .json({ error: "Fee-bump job timed out", code: "JOB_TIMEOUT" });
        return;
      }
      throw err;
    }

    res.json(response);
  } catch (error: any) {
    console.error("Error processing fee-bump request:", error);
    next(error);
  }
}

export async function feeBumpBatchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config,
): Promise<void> {
  try {
    const parsedBody = FeeBumpBatchSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return next(
        new AppError(
          `Validation failed: ${JSON.stringify(parsedBody.error.format())}`,
          400,
          "INVALID_XDR",
        ),
      );
    }

    const body: FeeBumpBatchRequest = parsedBody.data;
    const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;
    if (!apiKeyConfig) {
      res
        .status(500)
        .json({ error: "Missing tenant context for fee sponsorship" });
      return;
    }

    const tenant = syncTenantFromApiKey(apiKeyConfig);
    const feePayerAccount = pickFeePayerAccount(config);
    const stellarSponsor = new StellarFeeSponsor();

    await Promise.all(
      body.xdrs.map((xdr) =>
        enforceKycForFeeSponsorship(config, {
          chainId: "stellar",
          requestId: req.header("x-request-id") ?? undefined,
          tenant,
          transactionHash: fingerprintSponsorshipRequest(xdr),
        }),
      ),
    );

    const preparedFeeBumps = body.xdrs.map((xdr) =>
      prepareFeeBump(xdr, config),
    );
    const totalFeeStroops = preparedFeeBumps.reduce(
      (sum, prepared) => sum + prepared.feeAmount,
      0,
    );

    const quotaCheck = await checkTenantDailyQuota(
      tenant,
      totalFeeStroops,
      body.xdrs.length,
    );

    if (!quotaCheck.allowed) {
      throw new AppError(
        `Tier limit exceeded. Spend ${quotaCheck.currentSpendStroops}/${quotaCheck.dailyQuotaStroops} stroops and transactions ${quotaCheck.currentTxCount}/${quotaCheck.txLimit} today.`,
        403,
        "QUOTA_EXCEEDED",
      );
    }

    if (body.token) {
      const supportedAssets = config.supportedAssets ?? [];
      const isWhitelisted = supportedAssets.some((asset) => {
        const assetId = asset.issuer
          ? `${asset.code}:${asset.issuer}`
          : asset.code;
        return body.token === assetId;
      });

      if (!isWhitelisted) {
        throw new AppError(
          `Whitelisting failed: Asset "${body.token}" is not accepted for fee sponsorship.`,
          400,
          "UNSUPPORTED_ASSET",
        );
      }
    }

    const results: Array<
      Awaited<ReturnType<typeof stellarSponsor.buildSponsoredTx>>
    > = [];
    for (const xdr of body.xdrs) {
      const result = await stellarSponsor.buildSponsoredTx({
        config,
        feePayerAccount,
        submit: body.submit ?? false,
        tenant,
        xdr,
        token: body.token,
      });
      results.push(result);
    }

    res.json(results);
  } catch (error: any) {
    console.error("Error processing fee-bump batch request:", error);
    next(error);
  }
}
