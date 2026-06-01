import { Request, Response } from "express";
import { IntelligentRateLimiter } from "../services/intelligentRateLimiter";
import { TenantUsageTracker } from "../services/tenantUsageTracker";
import { getAuditActor, logAuditEvent } from "../services/auditLogger";
import { requireAdminToken } from "../utils/adminAuth";

// ── Handlers ───────────────────────────────────────────────────────────────

const rateLimiter = new IntelligentRateLimiter();
const usageTracker = new TenantUsageTracker();

/**
 * GET /admin/rate-limit/candidates
 * Get tenants eligible for tier upgrade
 */
export async function getUpgradeCandidatesHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  try {
    const candidates = await rateLimiter.getUpgradeCandidates();
    res.json({ candidates });
  } catch (error) {
    res.status(500).json({ error: "Failed to get upgrade candidates" });
  }
}

/**
 * POST /admin/rate-limit/adjust
 * Admin override to manually adjust tenant tier
 * Body: { tenantId, targetTier, reason }
 */
export async function adminTierAdjustmentHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  const { tenantId, targetTier, reason } = req.body ?? {};

  if (!tenantId || !targetTier) {
    res.status(400).json({ error: "tenantId and targetTier are required" });
    return;
  }

  const adminUserId = req.header("x-admin-user") || "unknown";

  try {
    const adjustment = await rateLimiter.adminOverrideTierAdjustment(
      tenantId,
      targetTier,
      adminUserId,
      reason
    );
    void logAuditEvent("RATE_LIMIT_OVERRIDE", getAuditActor(req), {
      tenantId,
      targetTier,
      reason,
      adminUserId,
    });
    res.status(201).json({ adjustment });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to adjust tier" 
    });
  }
}

/**
 * GET /admin/rate-limit/usage/:tenantId
 * Get usage statistics for a specific tenant
 */
export async function getTenantUsageHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  const { tenantId } = req.params;
  if (!tenantId) {
    res.status(400).json({ error: "tenantId is required" });
    return;
  }

  try {
    const usageScore = await usageTracker.getUsageScore(tenantId);
    const history = await rateLimiter.getTierAdjustmentHistory(tenantId);
    
    res.json({ 
      usageScore, 
      history,
      tenantId 
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get tenant usage" });
  }
}

/**
 * GET /admin/rate-limit/adjustments
 * Get all recent tier adjustments
 */
export async function getTierAdjustmentsHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  try {
    // This would need to be implemented in the rate limiter service
    // For now, return a placeholder
    res.json({ 
      adjustments: [],
      message: "Full adjustments list not yet implemented" 
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get tier adjustments" });
  }
}

/**
 * POST /admin/rate-limit/manual-score
 * Manually trigger daily scoring job
 */
export async function triggerManualScoringHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!requireAdminToken(req, res)) return;

  try {
    const { dailyScoringWorker } = await import("../workers/dailyScoringWorker");
    await dailyScoringWorker.runDailyScoring();
    void logAuditEvent("MANUAL_OVERRIDE", getAuditActor(req), {
      action: "manual-scoring",
    });
    res.json({ message: "Manual scoring job completed successfully" });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to run manual scoring" 
    });
  }
}
