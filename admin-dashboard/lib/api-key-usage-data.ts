export interface ApiKeyUsageStat {
  keyId: string;
  label: string;
  tenantId: string;
  successCount: number;
  failedCount: number;
  totalCount: number;
  failureRatePct: number;
  totalCostStroops: number;
}

interface ApiKeyInput {
  id: string;
  key: string;
  prefix: string;
  tenantId: string;
  active: boolean;
}

function seedFromKey(key: ApiKeyInput, index: number): ApiKeyUsageStat {
  const charSum = Array.from(key.id).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = (index + 1) * 1_200 + (charSum % 800);
  const total = key.active ? base : Math.floor(base * 0.15);
  const failureRate = key.active ? 0.04 : 0.28;
  const failedCount = Math.floor(total * failureRate);
  const successCount = total - failedCount;
  const failureRatePct = total > 0 ? Math.round((failedCount / total) * 100) : 0;
  const suffix = key.key.slice(-4);

  return {
    keyId: key.id,
    label: `${key.prefix}…${suffix}`,
    tenantId: key.tenantId,
    successCount,
    failedCount,
    totalCount: total,
    failureRatePct,
    totalCostStroops: successCount * 100,
  };
}

export function buildApiKeyUsageStats(keys: ApiKeyInput[]): ApiKeyUsageStat[] {
  return keys.map((key, index) => seedFromKey(key, index));
}
