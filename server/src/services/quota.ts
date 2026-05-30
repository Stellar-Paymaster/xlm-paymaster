import { Tenant } from "../models/tenantStore";
import {
  getTenantDailySpendStroops,
  getTenantDailyTransactionCount,
} from "../models/transactionLedger";

export interface QuotaCheckResult {
  allowed: boolean;
  currentSpendStroops: number;
  projectedSpendStroops: number;
  dailyQuotaStroops: number;
  currentTxCount: number;
  projectedTxCount: number;
  txLimit: number;
}

export async function checkTenantDailyQuota(
  tenant: Tenant,
  feeStroops: number,
  transactionCount = 1,
  now: Date = new Date(),
): Promise<QuotaCheckResult> {
  const [currentSpendStroops, currentTxCount] = await Promise.all([
    getTenantDailySpendStroops(tenant.id, now),
    getTenantDailyTransactionCount(tenant.id, now),
  ]);
  const projectedSpendStroops = currentSpendStroops + feeStroops;
  const projectedTxCount = currentTxCount + transactionCount;

  return {
    allowed:
      projectedSpendStroops <= tenant.dailyQuotaStroops &&
      projectedTxCount <= tenant.txLimit,
    currentSpendStroops,
    projectedSpendStroops,
    dailyQuotaStroops: tenant.dailyQuotaStroops,
    currentTxCount,
    projectedTxCount,
    txLimit: tenant.txLimit,
  };
}
