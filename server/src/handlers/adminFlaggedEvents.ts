import { Request, Response } from "express";
import prisma from "../utils/db";
import { getPendingFlaggedEvents } from "../services/anomalyDetection";

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.FLUID_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export async function listFlaggedEventsHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { status = "pending", limit = "50" } = req.query;
  const take = Math.min(Math.max(Number(limit), 1), 200);

  try {
    const events = await prisma.flaggedEvent.findMany({
      where: { status: status as string },
      include: {
        tenant: {
          select: { name: true }
        }
      },
      orderBy: [
        { riskScore: "desc" },
        { createdAt: "desc" }
      ],
      take
    });

    const formattedEvents = events.map(event => ({
      id: event.id,
      tenantId: event.tenantId,
      tenantName: event.tenant.name,
      eventDate: event.eventDate,
      hourStart: event.hourStart,
      actualSpendXlm: Number(event.actualSpendStroops) / 10_000_000,
      baselineDailyXlm: Number(event.baselineDailyStroops) / 10_000_000,
      multiplier: event.multiplier,
      riskScore: event.riskScore,
      status: event.status,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
      adminNote: event.adminNote,
      reviewedBy: event.reviewedBy,
      reviewedAt: event.reviewedAt,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    }));

    res.json({
      events: formattedEvents,
      total: events.length
    });
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list flagged events"
    });
  }
}

export async function getFlaggedEventHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { id } = req.params;

  try {
    const event = await prisma.flaggedEvent.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { name: true, subscriptionTier: { select: { name: true } } }
        }
      }
    });

    if (!event) {
      res.status(404).json({ error: "Flagged event not found" });
      return;
    }

    // Get recent transactions for context
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        tenantId: event.tenantId,
        createdAt: {
          gte: new Date(event.hourStart.getTime() - 2 * 60 * 60 * 1000), // 2 hours before
          lte: new Date(event.hourStart.getTime() + 2 * 60 * 60 * 1000)  // 2 hours after
        }
      },
      select: {
        id: true,
        costStroops: true,
        status: true,
        category: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    const formattedEvent = {
      id: event.id,
      tenantId: event.tenantId,
      tenantName: event.tenant.name,
      tenantTier: event.tenant.subscriptionTier.name,
      eventDate: event.eventDate,
      hourStart: event.hourStart,
      actualSpendXlm: Number(event.actualSpendStroops) / 10_000_000,
      baselineDailyXlm: Number(event.baselineDailyStroops) / 10_000_000,
      multiplier: event.multiplier,
      riskScore: event.riskScore,
      status: event.status,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
      adminNote: event.adminNote,
      reviewedBy: event.reviewedBy,
      reviewedAt: event.reviewedAt,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      recentTransactions: recentTransactions.map(tx => ({
        id: tx.id,
        costXlm: Number(tx.costStroops) / 10_000_000,
        status: tx.status,
        category: tx.category,
        createdAt: tx.createdAt
      }))
    };

    res.json(formattedEvent);
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get flagged event"
    });
  }
}

export async function updateFlaggedEventHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { id } = req.params;
  const { status, adminNote, reviewedBy } = req.body;

  if (!["approved", "blocked", "dismissed"].includes(status)) {
    res.status(400).json({ error: "Invalid status. Must be: approved, blocked, or dismissed" });
    return;
  }

  try {
    const event = await prisma.flaggedEvent.update({
      where: { id },
      data: {
        status,
        adminNote,
        reviewedBy: reviewedBy || "unknown",
        reviewedAt: new Date()
      }
    });

    // If blocked, we might want to take additional action like disabling API keys
    if (status === "blocked") {
      await prisma.apiKey.updateMany({
        where: { tenantId: event.tenantId },
        data: { active: false }
      });
    }

    res.json({
      id: event.id,
      status: event.status,
      adminNote: event.adminNote,
      reviewedBy: event.reviewedBy,
      reviewedAt: event.reviewedAt
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Record to update not found")) {
      res.status(404).json({ error: "Flagged event not found" });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update flagged event"
    });
  }
}

export async function getAnomalyStatsHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  try {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      pendingCount,
      approvedCount,
      blockedCount,
      dismissedCount,
      last24hCount,
      last7dCount
    ] = await Promise.all([
      prisma.flaggedEvent.count({ where: { status: "pending" } }),
      prisma.flaggedEvent.count({ where: { status: "approved" } }),
      prisma.flaggedEvent.count({ where: { status: "blocked" } }),
      prisma.flaggedEvent.count({ where: { status: "dismissed" } }),
      prisma.flaggedEvent.count({ where: { createdAt: { gte: last24Hours } } }),
      prisma.flaggedEvent.count({ where: { createdAt: { gte: last7Days } } })
    ]);

    // Get high-risk events (risk score > 0.7)
    const highRiskEvents = await prisma.flaggedEvent.findMany({
      where: {
        riskScore: { gt: 0.7 },
        status: "pending"
      },
      select: {
        id: true,
        tenantId: true,
        riskScore: true,
        multiplier: true,
        tenant: { select: { name: true } }
      },
      orderBy: { riskScore: "desc" },
      take: 10
    });

    res.json({
      summary: {
        pending: pendingCount,
        approved: approvedCount,
        blocked: blockedCount,
        dismissed: dismissedCount,
        last24Hours: last24hCount,
        last7Days: last7dCount
      },
      highRiskEvents: highRiskEvents.map(event => ({
        id: event.id,
        tenantId: event.tenantId,
        tenantName: event.tenant.name,
        riskScore: event.riskScore,
        multiplier: event.multiplier
      }))
    });
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get anomaly stats"
    });
  }
}
