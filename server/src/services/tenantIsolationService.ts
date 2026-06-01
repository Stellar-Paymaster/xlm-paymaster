import prisma from "../utils/db";

export interface TenantIsolationOptions {
  tenantId: string;
}

/**
 * Returns transactions scoped strictly to one tenant. Every query enforces the
 * tenantId predicate so no cross-tenant data can be returned, regardless of
 * what the caller passes for other filters.
 */
export async function getTenantTransactions(
  opts: TenantIsolationOptions,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
) {
  return (prisma as any).transaction.findMany({
    where: { tenantId: opts.tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

/**
 * Returns API keys scoped to one tenant.
 */
export async function getTenantApiKeys(opts: TenantIsolationOptions) {
  return (prisma as any).apiKey.findMany({
    where: { tenantId: opts.tenantId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Returns webhook deliveries scoped to one tenant.
 */
export async function getTenantWebhookDeliveries(
  opts: TenantIsolationOptions,
  { limit = 50 }: { limit?: number } = {}
) {
  return (prisma as any).webhookDelivery.findMany({
    where: { tenantId: opts.tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Returns the total fee spend for a tenant since UTC midnight today.
 */
export async function getTenantDailySpend(
  opts: TenantIsolationOptions
): Promise<bigint> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const rows: { feeStroops: bigint }[] = await (
    prisma as any
  ).sponsoredTransaction.findMany({
    where: {
      tenantId: opts.tenantId,
      createdAt: { gte: dayStart },
    },
    select: { feeStroops: true },
  });

  return rows.reduce((sum, tx) => sum + tx.feeStroops, 0n);
}

/**
 * Retrieves a tenant by its exact ID. Throws when not found to prevent callers
 * from treating a missing tenant as an empty result and leaking other data.
 */
export async function getTenantById(tenantId: string) {
  const tenant = await (prisma as any).tenant.findUnique({
    where: { id: tenantId },
    include: { subscriptionTier: true },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  return tenant;
}

/**
 * Returns quota top-ups scoped to one tenant.
 */
export async function getTenantQuotaTopUps(opts: TenantIsolationOptions) {
  return (prisma as any).quotaTopUp.findMany({
    where: { tenantId: opts.tenantId },
    orderBy: { createdAt: "desc" },
  });
}
