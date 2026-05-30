import { describe, it, expect, vi } from 'vitest';
import { StellarAutoSwapService, SwapRequest } from './autoSwap';

describe('StellarAutoSwapService', () => {
  it('should skip swap if source asset is already XLM', async () => {
    const service = new StellarAutoSwapService({});
    const request: SwapRequest = { tenantId: 'tenant-1', amount: 100, sourceAsset: 'XLM' };
    
    const result = await service.autoSwapFees(request);
    expect(result.success).toBe(true);
    expect(result.txHash).toBeUndefined();
  });

  it('should successfully execute swap for non-XLM asset', async () => {
    const mockDexClient = {
      executeSwap: vi.fn().mockResolvedValue('mock-tx-hash'),
    };
    const service = new StellarAutoSwapService(mockDexClient);
    const request: SwapRequest = { tenantId: 'tenant-1', amount: 100, sourceAsset: 'USDC' };
    
    const result = await service.autoSwapFees(request);
    expect(result.success).toBe(true);
    expect(result.txHash).toBe('mock-tx-hash');
    expect(mockDexClient.executeSwap).toHaveBeenCalledWith({
      from: 'USDC',
      to: 'XLM',
      amount: 100,
    });
  });

  it('should handle swap failures', async () => {
    const mockDexClient = {
      executeSwap: vi.fn().mockRejectedValue(new Error('DEX Error')),
    };
    const service = new StellarAutoSwapService(mockDexClient);
    const request: SwapRequest = { tenantId: 'tenant-1', amount: 100, sourceAsset: 'USDC' };
    
    const result = await service.autoSwapFees(request);
    expect(result.success).toBe(false);
  });
});
