/**
 * Sandbox environment handlers (#717)
 *
 * Manual reset endpoint and auto-reset helpers for stale sandbox API keys.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { randomBytes } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { ApiKeyConfig, invalidateCachedApiKey } from "../middleware/apiKeys";
import { purgeSandboxTenantData } from "../services/sandboxCleanup";
import { requireAdminToken } from "../utils/adminAuth";
import prisma from "../utils/db";
import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "sandbox_handler" });

const SANDBOX_HORIZON_URL =
  process.env.SANDBOX_HORIZON_URL ?? "http://localhost:8000";
const SANDBOX_RESET_STALE_HOURS = Number(
  process.env.SANDBOX_RESET_STALE_HOURS ?? "24",
);

const apiKeyModel = (prisma as any).apiKey as {
  findMany: (args: any) => Promise<any[]>;
  findUnique: (args: any) => Promise<any | null>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

function generateApiKeyValue(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("hex")}`;
}

function generateSandboxKeypair(): { secret: string; publicKey: string } {
  const keypair = Keypair.random();
  return {
    secret: keypair.secret(),
    publicKey: keypair.publicKey(),
  };
}

async function fundSandboxAccount(publicKey: string): Promise<boolean> {
  try {
    const url = `${SANDBOX_HORIZON_URL.replace(/\/$/, "")}/friendbot?addr=${encodeURIComponent(publicKey)}`;
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch (error) {
    logger.warn(
      { ...serializeError(error), publicKey },
      "Sandbox friendbot funding failed",
    );
    return false;
  }
}

/**
 * Reset a single sandbox API key: rotate fee payer, wipe tenant data, fund account.
 */
export async function resetSandboxKey(apiKeyId: string): Promise<{
  resetAt: string;
  sandboxPublicKey: string;
  deletedTransactions: number;
  funded: boolean;
}> {
  const record = await apiKeyModel.findUnique({ where: { id: apiKeyId } });

  if (!record?.isSandbox) {
    throw new AppError("Sandbox API key not found.", 404, "NOT_FOUND");
  }

  const { secret, publicKey } = generateSandboxKeypair();
  const resetAt = new Date();

  const purgeResult = await purgeSandboxTenantData(record.tenantId);

  await apiKeyModel.update({
    where: { id: apiKeyId },
    data: {
      sandboxFeePayerSecret: secret,
      sandboxLastResetAt: resetAt,
    },
  });

  await invalidateCachedApiKey(record.key);

  const funded = await fundSandboxAccount(publicKey);

  logger.info(
    {
      apiKeyId,
      tenantId: record.tenantId,
      deletedTransactions: purgeResult.transactionsDeleted,
      funded,
    },
    "Sandbox key reset complete",
  );

  return {
    resetAt: resetAt.toISOString(),
    sandboxPublicKey: publicKey,
    deletedTransactions: purgeResult.transactionsDeleted,
    funded,
  };
}

/**
 * Auto-reset sandbox keys whose last reset was more than SANDBOX_RESET_STALE_HOURS ago.
 */
export async function autoResetStaleSandboxKeys(
  now: Date = new Date(),
): Promise<number> {
  const staleBefore = new Date(now);
  staleBefore.setHours(staleBefore.getHours() - SANDBOX_RESET_STALE_HOURS);

  const staleKeys = await apiKeyModel.findMany({
    where: {
      isSandbox: true,
      active: true,
      OR: [
        { sandboxLastResetAt: null },
        { sandboxLastResetAt: { lt: staleBefore } },
      ],
    },
    select: { id: true },
  });

  let resetCount = 0;

  for (const key of staleKeys) {
    try {
      await resetSandboxKey(key.id);
      resetCount += 1;
    } catch (error) {
      logger.error(
        { ...serializeError(error), apiKeyId: key.id },
        "Failed to auto-reset stale sandbox key",
      );
    }
  }

  return resetCount;
}

/** POST /sandbox/reset — manual reset using the caller's sandbox API key. */
export async function sandboxResetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;

    if (!apiKeyConfig?.isSandbox) {
      throw new AppError(
        "Only sandbox API keys may reset the sandbox environment.",
        403,
        "FORBIDDEN",
      );
    }

    const record = await apiKeyModel.findUnique({
      where: { key: apiKeyConfig.key },
      select: { id: true },
    });

    if (!record) {
      throw new AppError("Sandbox API key not found.", 404, "NOT_FOUND");
    }

    const result = await resetSandboxKey(record.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /admin/sandbox/api-keys — create a new sandbox key for a tenant. */
export async function createSandboxApiKeyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  const { tenantId, name } = req.body as {
    tenantId?: string;
    name?: string;
  };

  if (!tenantId || typeof tenantId !== "string") {
    res.status(400).json({ error: "tenantId is required" });
    return;
  }

  const tenant = await (prisma as any).tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const prefix = tenant.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 12);
  const { secret, publicKey } = generateSandboxKeypair();
  const keyValue = generateApiKeyValue(`${prefix}_sandbox`);

  const created = await apiKeyModel.create({
    data: {
      key: keyValue,
      prefix: `${prefix}_sandbox`,
      name: name ?? "Sandbox Key",
      tenantId,
      isSandbox: true,
      sandboxFeePayerSecret: secret,
      maxRequests: Number(process.env.SANDBOX_RATE_LIMIT_MAX ?? "10"),
      tier: "free",
      allowedChains: "stellar",
    },
  });

  const funded = await fundSandboxAccount(publicKey);

  res.status(201).json({
    id: created.id,
    key: created.key,
    prefix: created.prefix,
    tenantId: created.tenantId,
    sandboxPublicKey: publicKey,
    funded,
  });
}
