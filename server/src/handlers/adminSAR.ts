import { Request, Response } from "express";
import { prisma, replicaDb } from "../utils/db";

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.FLUID_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

/**
 * GET /admin/sar
 * List SAR reports, optionally filtered by status.
 */
export async function listSARReportsHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  const { status, limit = "100" } = req.query;
  const take = Math.min(Math.max(Number(limit), 1), 500);

  const sarStatus = status && typeof status === "string" ? status : undefined;

  try {
    const reports = await replicaDb.sARReport.findMany({
      where: sarStatus ? { status: sarStatus } : undefined,
      include: {
        tenant: { select: { name: true } },
        transaction: {
          select: { txHash: true, innerTxHash: true, category: true, chain: true, createdAt: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take
    });

    res.json({
      reports: reports.map(r => ({
        id: r.id,
        transactionId: r.transactionId,
        txHash: r.transaction.txHash ?? r.transaction.innerTxHash,
        category: r.transaction.category,
        chain: r.transaction.chain,
        txCreatedAt: r.transaction.createdAt,
        tenantId: r.tenantId,
        tenantName: r.tenant.name,
        ruleCode: r.ruleCode,
        reason: r.reason,
        status: r.status,
        adminNote: r.adminNote,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt,
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      })),
      total: reports.length
    });
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list SAR reports"
    });
  }
}

/**
 * GET /admin/sar/:id
 * Get a single SAR report with full transaction context.
 */
export async function getSARReportHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  const { id } = req.params;

  try {
    const report = await replicaDb.sARReport.findUnique({
      where: { id },
      include: {
        tenant: { select: { name: true, subscriptionTier: { select: { name: true } } } },
        transaction: {
          select: {
            txHash: true,
            innerTxHash: true,
            status: true,
            costStroops: true,
            category: true,
            chain: true,
            createdAt: true
          }
        }
      }
    });

    if (!report) {
      res.status(404).json({ error: "SAR report not found" });
      return;
    }

    // Fetch recent transactions from the same tenant around the same time for context
    const contextStart = new Date(report.createdAt.getTime() - 2 * 60 * 1000); // 2 min before
    const contextEnd = new Date(report.createdAt.getTime() + 2 * 60 * 1000);   // 2 min after
    const contextTxns = await replicaDb.transaction.findMany({
      where: {
        tenantId: report.tenantId,
        createdAt: { gte: contextStart, lte: contextEnd }
      },
      select: {
        id: true,
        txHash: true,
        innerTxHash: true,
        status: true,
        costStroops: true,
        category: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    res.json({
      id: report.id,
      transactionId: report.transactionId,
      txHash: report.transaction.txHash ?? report.transaction.innerTxHash,
      txStatus: report.transaction.status,
      txCostXlm: Number(report.transaction.costStroops) / 10_000_000,
      txCategory: report.transaction.category,
      txChain: report.transaction.chain,
      txCreatedAt: report.transaction.createdAt,
      tenantId: report.tenantId,
      tenantName: report.tenant.name,
      tenantTier: report.tenant.subscriptionTier.name,
      ruleCode: report.ruleCode,
      reason: report.reason,
      status: report.status,
      adminNote: report.adminNote,
      reviewedBy: report.reviewedBy,
      reviewedAt: report.reviewedAt,
      metadata: report.metadata ? JSON.parse(report.metadata) : null,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      contextTransactions: contextTxns.map(tx => ({
        id: tx.id,
        txHash: tx.txHash ?? tx.innerTxHash,
        status: tx.status,
        costXlm: Number(tx.costStroops) / 10_000_000,
        category: tx.category,
        createdAt: tx.createdAt
      }))
    });
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get SAR report"
    });
  }
}

/**
 * PATCH /admin/sar/:id/review
 * Mark a SAR report as reviewed with a decision.
 * status must be: confirmed_suspicious | false_positive
 */
export async function reviewSARReportHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  const { id } = req.params;
  const { status, adminNote, reviewedBy } = req.body;

  const validStatuses = ["confirmed_suspicious", "false_positive"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
    });
    return;
  }

  try {
    const report = await prisma.sARReport.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote ?? null,
        reviewedBy: reviewedBy || "admin",
        reviewedAt: new Date()
      }
    });

    res.json({
      id: report.id,
      status: report.status,
      adminNote: report.adminNote,
      reviewedBy: report.reviewedBy,
      reviewedAt: report.reviewedAt
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Record to update not found")) {
      res.status(404).json({ error: "SAR report not found" });
      return;
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to review SAR report"
    });
  }
}

/**
 * GET /admin/sar/stats
 * Summary counts for SAR dashboard section.
 */
export async function getSARStatsHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [pending, confirmed, falsePositive, last24hCount, last7dCount, byRule] = await Promise.all([
      replicaDb.sARReport.count({ where: { status: "pending_review" } }),
      replicaDb.sARReport.count({ where: { status: "confirmed_suspicious" } }),
      replicaDb.sARReport.count({ where: { status: "false_positive" } }),
      replicaDb.sARReport.count({ where: { createdAt: { gte: last24h } } }),
      replicaDb.sARReport.count({ where: { createdAt: { gte: last7d } } }),
      replicaDb.sARReport.groupBy({
        by: ["ruleCode"],
        _count: { id: true },
        where: { status: "pending_review" }
      })
    ]);

    res.json({
      summary: {
        pending,
        confirmed,
        falsePositive,
        last24Hours: last24hCount,
        last7Days: last7dCount
      },
      byRule: byRule.map(r => ({
        ruleCode: r.ruleCode,
        pendingCount: r._count.id
      }))
    });
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get SAR stats"
    });
  }
}

/**
 * GET /admin/sar/export
 * Export flagged SAR reports as CSV for external reporting.
 * Query params: status (optional, default: all), from, to (ISO date strings)
 */
export async function exportSARReportsHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  const { status, from, to } = req.query;

  const exportStatus = status && typeof status === "string" ? status : undefined;
  const fromDate = from && typeof from === "string" ? new Date(from) : undefined;
  const toDate = to && typeof to === "string" ? new Date(to) : undefined;

  try {
    const reports = await replicaDb.sARReport.findMany({
      where: {
        ...(exportStatus ? { status: exportStatus } : {}),
        ...((fromDate || toDate) ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {})
          }
        } : {})
      },
      include: {
        tenant: { select: { name: true } },
        transaction: {
          select: { txHash: true, innerTxHash: true, costStroops: true, category: true, chain: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const csvHeader = [
      "id",
      "tenant_id",
      "tenant_name",
      "transaction_id",
      "tx_hash",
      "category",
      "chain",
      "cost_xlm",
      "rule_code",
      "reason",
      "status",
      "admin_note",
      "reviewed_by",
      "reviewed_at",
      "flagged_at"
    ].join(",");

    const csvRows = reports.map(r => {
      const costXlm = (Number(r.transaction.costStroops) / 10_000_000).toFixed(7);
      const txHash = r.transaction.txHash ?? r.transaction.innerTxHash;
      return [
        r.id,
        r.tenantId,
        escapeCsv(r.tenant.name),
        r.transactionId,
        txHash ?? "",
        escapeCsv(r.transaction.category),
        r.transaction.chain,
        costXlm,
        r.ruleCode,
        escapeCsv(r.reason),
        r.status,
        escapeCsv(r.adminNote ?? ""),
        escapeCsv(r.reviewedBy ?? ""),
        r.reviewedAt ? r.reviewedAt.toISOString() : "",
        r.createdAt.toISOString()
      ].join(",");
    });

    const csv = [csvHeader, ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="sar-report-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to export SAR reports"
    });
  }
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
