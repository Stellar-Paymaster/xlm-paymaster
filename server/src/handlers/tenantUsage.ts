import { Request, Response } from "express";
import type { ApiKeyConfig } from "../middleware/apiKeys";
import {
  getTenantDailySpendStroops,
  getTenantDailyTransactionCount,
  getTenantMonthSponsoredTotals,
  getTenantSponsoredDailySeries,
} from "../models/transactionLedger";
import prisma from "../utils/db";

const STROOPS_PER_XLM = 10_000_000;
const QUOTA_WARNING_RATIO = 0.8;

function requireApiKeyContext(
  res: Response,
  config: ApiKeyConfig | undefined
): config is ApiKeyConfig {
  if (!config) {
    res.status(401).json({ error: "API key required", code: "AUTH_FAILED" });
    return false;
  }
  return true;
}

/**
 * @openapi
 * /v1/usage/summary:
 *   get:
 *     summary: Tenant usage summary (calendar month + daily quota window)
 *     description: Returns aggregates for the authenticated API key's tenant only.
 *     tags:
 *       - Usage
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Usage summary
 *       401:
 *         description: Missing or invalid API key
 */
export async function getTenantUsageSummaryHandler(
  req: Request,
  res: Response
): Promise<void> {
  const config = res.locals.apiKey as ApiKeyConfig | undefined;
  if (!requireApiKeyContext(res, config)) return;

  try {
    const now = new Date();
    const [
      monthTotals,
      daySpendStroops,
      dayTxCount,
      keyMeta,
    ] = await Promise.all([
      getTenantMonthSponsoredTotals(config.tenantId, now),
      getTenantDailySpendStroops(config.tenantId, now),
      getTenantDailyTransactionCount(config.tenantId, now),
      prisma.apiKey.findUnique({
        where: { key: config.key },
        select: { name: true, lastUsedAt: true },
      }),
    ]);

    const quotaStroops = config.dailyQuotaStroops;
    const txLimit = config.txLimit;
    const remainingStroops = Math.max(0, quotaStroops - daySpendStroops);
    const remainingTx = Math.max(0, txLimit - dayTxCount);

    const stroopsRatio =
      quotaStroops > 0 ? daySpendStroops / quotaStroops : 0;
    const txRatio = txLimit > 0 ? dayTxCount / txLimit : 0;
    const quotaWarning =
      stroopsRatio >= QUOTA_WARNING_RATIO || txRatio >= QUOTA_WARNING_RATIO;

    res.json({
      month: {
        txCount: monthTotals.txCount,
        xlmSponsored: monthTotals.feeStroops / STROOPS_PER_XLM,
      },
      day: {
        txCount: dayTxCount,
        stroopsUsed: daySpendStroops,
        quotaStroops,
        txLimit,
        remainingTx,
        remainingStroops,
        resetsUtcDaily: true,
      },
      quotaWarning,
      apiKey: {
        name: keyMeta?.name ?? config.name,
        lastUsedAt: keyMeta?.lastUsedAt?.toISOString() ?? null,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to load usage summary",
    });
  }
}

/**
 * @openapi
 * /v1/usage/chart:
 *   get:
 *     summary: Daily sponsored usage for charting
 *     tags:
 *       - Usage
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of UTC days (max 90)
 *     responses:
 *       200:
 *         description: Time series of tx counts and fee stroops per day
 */
export async function getTenantUsageChartHandler(
  req: Request,
  res: Response
): Promise<void> {
  const config = res.locals.apiKey as ApiKeyConfig | undefined;
  if (!requireApiKeyContext(res, config)) return;

  const rawDays = Number.parseInt(String(req.query.days ?? "30"), 10);
  const days = Number.isFinite(rawDays) ? rawDays : 30;

  try {
    const series = await getTenantSponsoredDailySeries(
      config.tenantId,
      days,
      new Date()
    );
    res.json({ days: series.length, series });
  } catch (error: unknown) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to load usage chart",
    });
  }
}

/**
 * @openapi
 * /v1/usage/transactions:
 *   get:
 *     summary: Recent fee-bump transactions for this tenant
 *     tags:
 *       - Usage
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Recent transactions
 */
export async function getTenantUsageTransactionsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const config = res.locals.apiKey as ApiKeyConfig | undefined;
  if (!requireApiKeyContext(res, config)) return;

  const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
  const take = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;

  try {
    const transactions = await prisma.transaction.findMany({
      where: { tenantId: config.tenantId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        txHash: true,
        innerTxHash: true,
        status: true,
        costStroops: true,
        category: true,
        chain: true,
        createdAt: true,
      },
    });

    res.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        hash: t.txHash ?? t.innerTxHash,
        txHash: t.txHash,
        innerTxHash: t.innerTxHash,
        status: t.status.toLowerCase(),
        costStroops: Number(t.costStroops),
        category: t.category,
        chain: t.chain,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to list transactions",
    });
  }
}
