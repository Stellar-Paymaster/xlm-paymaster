import { describe, it, expect, vi } from 'vitest';
import { BulkTenantUpdateService, TenantRateLimitUpdate } from './bulkTenantUpdates';

describe('BulkTenantUpdateService', () => {
  it('should successfully apply rate limits to multiple tenants', async () => {
    const mockDbClient = {
      tenant: {
        update: vi.fn().mockResolvedValue(true),
      },
    };
    const service = new BulkTenantUpdateService(mockDbClient);

    const updates: TenantRateLimitUpdate[] = [
      { tenantId: 'tenant-1', newRateLimit: 100 },
      { tenantId: 'tenant-2', newRateLimit: 200 },
    ];

    const result = await service.applyRateLimits(updates);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockDbClient.tenant.update).toHaveBeenCalledTimes(2);
  });

  it('should handle partial failures', async () => {
    const mockDbClient = {
      tenant: {
        update: vi.fn()
          .mockResolvedValueOnce(true)
          .mockRejectedValueOnce(new Error('DB Error')),
      },
    };
    const service = new BulkTenantUpdateService(mockDbClient);

    const updates: TenantRateLimitUpdate[] = [
      { tenantId: 'tenant-1', newRateLimit: 100 },
      { tenantId: 'tenant-2', newRateLimit: 200 },
    ];

    const result = await service.applyRateLimits(updates);
    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
  });
});
