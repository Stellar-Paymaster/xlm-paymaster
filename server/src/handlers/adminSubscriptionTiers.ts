import { Request, Response } from "express";
import prisma from "../utils/db";
import { invalidateCachedApiKey } from "../middleware/apiKeys";
import { toTierCode } from "../models/subscriptionTier";
import { getAuditActor, logAuditEvent } from "../services/auditLogger";
import { requireAdminToken } from "../utils/adminAuth";

export async function listSubscriptionTiersHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) return;

  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : null;

  try {
    const [tiers, tenants] = await Promise.all([
      prisma.subscriptionTier.findMany({
        orderBy: { priceMonthly: "asc" },
      }),
      prisma.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        include: { subscriptionTier: true },
      }),
    ]);

    const selectedTenant =
      tenants.find((item) => item.id === tenantId) ??
      tenants[0] ??
      null;

    res.json({
      tiers: tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        code: toTierCode(tier.name),
        txLimit: tier.txLimit,
        rateLimit: tier.rateLimit,
        priceMonthly: tier.priceMonthly,
      })),
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        subscriptionTierId: tenant.subscriptionTierId,
        subscriptionTier: {
          id: tenant.subscriptionTier.id,
          name: tenant.subscriptionTier.name,
          code: toTierCode(tenant.subscriptionTier.name),
          txLimit: tenant.subscriptionTier.txLimit,
          rateLimit: tenant.subscriptionTier.rateLimit,
          priceMonthly: tenant.subscriptionTier.priceMonthly,
        },
      })),
      tenant: selectedTenant
        ? {
            id: selectedTenant.id,
            name: selectedTenant.name,
            subscriptionTierId: selectedTenant.subscriptionTierId,
            subscriptionTier: {
              id: selectedTenant.subscriptionTier.id,
              name: selectedTenant.subscriptionTier.name,
              code: toTierCode(selectedTenant.subscriptionTier.name),
              txLimit: selectedTenant.subscriptionTier.txLimit,
              rateLimit: selectedTenant.subscriptionTier.rateLimit,
              priceMonthly: selectedTenant.subscriptionTier.priceMonthly,
            },
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load subscription tiers" });
  }
}

export async function updateTenantSubscriptionTierHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) return;

  const { tenantId } = req.params;
  const { tierId } = req.body as { tierId?: string };

  if (!tenantId || !tierId) {
    res.status(400).json({ error: "tenantId and tierId are required" });
    return;
  }

  try {
    const tier = await prisma.subscriptionTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) {
      res.status(404).json({ error: "Subscription tier not found" });
      return;
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionTierId: tier.id },
      include: { subscriptionTier: true },
    });

    void logAuditEvent("TENANT_TIER_UPDATE", getAuditActor(req), {
      tenantId,
      tierId: tier.id,
      tierName: tier.name,
    });

    const apiKeys = await prisma.apiKey.findMany({
      where: { tenantId },
      select: { key: true },
    });

    await prisma.apiKey.updateMany({
      where: { tenantId },
      data: {
        tier: toTierCode(tier.name),
        maxRequests: tier.rateLimit,
      },
    });

    await Promise.all(apiKeys.map((apiKey) => invalidateCachedApiKey(apiKey.key)));

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subscriptionTierId: tenant.subscriptionTierId,
        subscriptionTier: {
          id: tenant.subscriptionTier.id,
          name: tenant.subscriptionTier.name,
          code: toTierCode(tenant.subscriptionTier.name),
          txLimit: tenant.subscriptionTier.txLimit,
          rateLimit: tenant.subscriptionTier.rateLimit,
          priceMonthly: tenant.subscriptionTier.priceMonthly,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update tenant subscription tier" });
  }
}
