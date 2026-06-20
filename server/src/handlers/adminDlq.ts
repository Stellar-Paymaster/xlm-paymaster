import { Request, Response } from "express";
import prisma from "../utils/db";
import { WebhookService } from "../services/webhook";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "admin_dlq" });

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.PAYMASTER_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export async function listDlqHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) return;

  try {
    const items = await prisma.webhookDlq.findMany({
      where: {
        expiresAt: { gt: new Date() },
      },
      orderBy: { failedAt: "desc" },
      include: {
        tenant: {
          select: { name: true },
        },
      },
    });

    res.json({
      items: items.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        tenantName: item.tenant.name,
        deliveryId: item.deliveryId,
        url: item.url,
        payload: item.payload,
        lastError: item.lastError,
        retryCount: item.retryCount,
        failedAt: item.failedAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ error }, "Failed to list DLQ items");
    res.status(500).json({ error: "Failed to list DLQ items" });
  }
}

export async function replayDlqHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) return;

  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }

  try {
    const dlqItems = await prisma.webhookDlq.findMany({
      where: { id: { in: ids } },
    });

    if (dlqItems.length === 0) {
      res.status(404).json({ error: "No matching DLQ items found" });
      return;
    }

    const results: { id: string; status: string }[] = [];

    for (const item of dlqItems) {
      try {
        await WebhookService.queueWebhook(
          item.tenantId,
          item.url,
          item.payload
        );

        await prisma.webhookDlq.delete({ where: { id: item.id } });

        results.push({ id: item.id, status: "replayed" });
      } catch (err) {
        logger.error({ error: err, dlq_id: item.id }, "Failed to replay DLQ item");
        results.push({ id: item.id, status: "failed" });
      }
    }

    res.json({ results });
  } catch (error) {
    logger.error({ error }, "Failed to replay DLQ items");
    res.status(500).json({ error: "Failed to replay DLQ items" });
  }
}

export async function deleteDlqHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) return;

  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }

  try {
    const result = await prisma.webhookDlq.deleteMany({
      where: { id: { in: ids } },
    });

    res.json({ deleted: result.count });
  } catch (error) {
    logger.error({ error }, "Failed to delete DLQ items");
    res.status(500).json({ error: "Failed to delete DLQ items" });
  }
}
