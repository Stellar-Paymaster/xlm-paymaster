export interface TenantRateLimitUpdate {
  tenantId: string;
  newRateLimit: number;
}

export class BulkTenantUpdateService {
  constructor(private dbClient: any) {}

  async applyRateLimits(updates: TenantRateLimitUpdate[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const update of updates) {
      try {
        await this.dbClient.tenant.update({
          where: { id: update.tenantId },
          data: { rateLimit: update.newRateLimit },
        });
        success++;
      } catch (error) {
        console.error(`Failed to update tenant ${update.tenantId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }
}
