import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlutterFluidClient } from './flutter';
import { FluidConfigurationError, FluidNetworkError, FluidServerError, FluidWalletError } from './errors';

describe('FlutterFluidClient', () => {
  const mockConfig = {
    networkPassphrase: 'Test SDF Network ; September 2015',
    serverUrl: 'http://localhost:9999',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with minimal config', () => {
      const client = new FlutterFluidClient(mockConfig);
      expect(client).toBeInstanceOf(FlutterFluidClient);
    });

    it('should set default values correctly', () => {
      const client = new FlutterFluidClient(mockConfig);
      const config = client.getConfig();

      expect(config.enableAutoRetry).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.networkTimeoutMs).toBe(30000);
      expect(config.verboseErrors).toBe(false);
    });

    it('should override default values', () => {
      const client = new FlutterFluidClient({
        ...mockConfig,
        enableAutoRetry: false,
        maxRetries: 5,
        networkTimeoutMs: 15000,
        verboseErrors: true,
      });
      const config = client.getConfig();

      expect(config.enableAutoRetry).toBe(false);
      expect(config.maxRetries).toBe(5);
      expect(config.networkTimeoutMs).toBe(15000);
      expect(config.verboseErrors).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should return success on valid platform', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const result = await client.initialize();

      expect(result).toMatchObject({
        success: true,
      });
    });
  });

  describe('buildAndRequestFeeBump', () => {
    it('should handle network errors gracefully', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new FluidNetworkError('Network error', 'http://localhost:9999')
      );

      const result = await client.buildAndRequestFeeBump('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NETWORK_ERROR');
      expect(result.error).toContain('Network error');
    });

    it('should retry on network errors when auto-retry is enabled', async () => {
      vi.useFakeTimers();
      const client = new FlutterFluidClient({
        ...mockConfig,
        enableAutoRetry: true,
        maxRetries: 3,
      });

      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump')
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValue({
          xdr: 'fee-bump-xdr',
          status: 'ready',
        });

      const resultPromise = client.buildAndRequestFeeBump('test-xdr' as any);
      
      // Fast-forward through retry delays
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();

      const result = await resultPromise;

      expect(nativeClient.buildAndRequestFeeBump).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    it('should not retry on configuration errors', async () => {
      const client = new FlutterFluidClient({
        ...mockConfig,
        enableAutoRetry: true,
        maxRetries: 3,
      });

      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new FluidConfigurationError('Invalid config')
      );

      const result = await client.buildAndRequestFeeBump('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIGURATION_ERROR');
      expect(nativeClient.buildAndRequestFeeBump).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestFeeBump', () => {
    it('should handle submission flag', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      const spy = vi.spyOn(nativeClient, 'requestFeeBump').mockResolvedValue({
        xdr: 'test',
        status: 'ready',
      } as any);

      await client.requestFeeBump('test-xdr' as any, true);

      expect(spy).toHaveBeenCalledWith('test-xdr', true);
    });
  });

  describe('buildTokenTransfer', () => {
    it('should handle errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildSACTransferTx').mockRejectedValue(
        new FluidServerError('Invalid token', 400, 'https://soroban.example')
      );

      const result = await client.buildTokenTransfer({
        destination: 'GABC...',
        amount: '100',
        asset: 'USDC',
      } as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SERVER_ERROR');
      expect((result.context as any).statusCode).toBe(400);
    });
  });

  describe('submitTransaction', () => {
    it('should handle submission errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'submitFeeBumpTransaction').mockRejectedValue(
        new FluidNetworkError('Submission failed', 'https://horizon.example')
      );

      const result = await client.submitTransaction('fee-bump-xdr');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NETWORK_ERROR');
    });
  });

  describe('waitForConfirmation', () => {
    it('should handle timeout', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'waitForConfirmation').mockRejectedValue(
        new Error('Timed out waiting for transaction confirmation')
      );

      const result = await client.waitForConfirmation('tx-hash-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TIMEOUT_ERROR');
    });
  });

  describe('sendTransaction', () => {
    it('should handle build failure', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();

      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new FluidWalletError('Signing failed')
      );
      const submitSpy = vi.spyOn(nativeClient, 'submitFeeBumpTransaction');

      const result = await client.sendTransaction('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('WALLET_ERROR');
      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('should handle submit failure', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();

      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockResolvedValue({
        xdr: 'fee-bump-xdr',
        status: 'ready',
      });
      vi.spyOn(nativeClient, 'submitFeeBumpTransaction').mockRejectedValue(
        new FluidNetworkError('Submit failed', 'https://horizon.example')
      );

      const result = await client.sendTransaction('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NETWORK_ERROR');
    });
  });

  describe('signTransactions', () => {
    it('should handle signing errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();

      vi.spyOn(nativeClient, 'signMultipleTransactions').mockRejectedValue(
        new FluidWalletError('Signing failed')
      );

      const result = await client.signTransactions(['tx1' as any], 'keypair' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('WALLET_ERROR');
    });
  });

  describe('error handling', () => {
    it('should handle configuration errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new FluidConfigurationError('Invalid config')
      );

      const result = await client.buildAndRequestFeeBump('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIGURATION_ERROR');
    });

    it('should handle network errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new FluidNetworkError('Network error', 'https://fluid.example')
      );

      const result = await client.buildAndRequestFeeBump('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NETWORK_ERROR');
    });

    it('should handle server errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new FluidServerError('Server error', 500, 'https://fluid.example')
      );

      const result = await client.buildAndRequestFeeBump('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SERVER_ERROR');
      expect((result.context as any).statusCode).toBe(500);
    });

    it('should handle wallet errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new FluidWalletError('Signing failed')
      );

      const result = await client.buildAndRequestFeeBump('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('WALLET_ERROR');
    });

    it('should handle unknown errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new Error('Unknown error')
      );

      const result = await client.buildAndRequestFeeBump('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNKNOWN_ERROR');
    });

    it('should handle timeout errors', async () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      vi.spyOn(nativeClient, 'buildAndRequestFeeBump').mockRejectedValue(
        new Error('Timed out waiting for response')
      );

      const result = await client.buildAndRequestFeeBump('test-xdr' as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TIMEOUT_ERROR');
    });
  });

  describe('utility methods', () => {
    it('should report bugs', () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      const spy = vi.spyOn(nativeClient, 'reportBug');

      client.reportBug('test bug', { extra: 'context' });

      expect(spy).toHaveBeenCalledWith('test bug', { extra: 'context' });
    });

    it('should terminate', () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = (client as any).getNativeClient();
      const spy = vi.spyOn(nativeClient, 'terminate');

      client.terminate();

      expect(spy).toHaveBeenCalled();
    });

    it('should get native client', () => {
      const client = new FlutterFluidClient(mockConfig);
      const nativeClient = client.getNativeClient();

      expect(nativeClient).toBeDefined();
    });

    it('should get config', () => {
      const client = new FlutterFluidClient(mockConfig);
      const config = client.getConfig();

      expect(config).toMatchObject({
        networkPassphrase: 'Test SDF Network ; September 2015',
        serverUrl: 'http://localhost:9999',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        enableAutoRetry: true,
        maxRetries: 3,
      });
    });
  });

  describe('error code constants', () => {
    it('should export error codes', async () => {
      // Use dynamic import to avoid module resolution issues
      const mod = await import('./flutter.ts');
      const { FlutterSDKErrorCodes } = mod;

      expect(FlutterSDKErrorCodes.CONFIGURATION_ERROR).toBe('CONFIGURATION_ERROR');
      expect(FlutterSDKErrorCodes.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(FlutterSDKErrorCodes.SERVER_ERROR).toBe('SERVER_ERROR');
      expect(FlutterSDKErrorCodes.WALLET_ERROR).toBe('WALLET_ERROR');
      expect(FlutterSDKErrorCodes.TIMEOUT_ERROR).toBe('TIMEOUT_ERROR');
      expect(FlutterSDKErrorCodes.PLATFORM_INCOMPATIBLE).toBe('PLATFORM_INCOMPATIBLE');
      expect(FlutterSDKErrorCodes.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
    });
  });
});
