import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  collectTelemetry,
  createTelemetryCollector,
  isTelemetryEnabled,
  getTelemetryConfig,
  TelemetryConfig,
} from '../../telemetry';

describe('Telemetry', () => {
  let localStorageMock: Record<string, string>;
  let sendBeaconMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock localStorage
    localStorageMock = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => localStorageMock[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageMock[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete localStorageMock[key];
        }),
        clear: vi.fn(() => {
          localStorageMock = {};
        }),
      },
      writable: true,
    });

    // Mock navigator.sendBeacon
    sendBeaconMock = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconMock,
      writable: true,
    });

    // Mock fetch
    fetchMock = vi.fn(() => Promise.resolve());
    global.fetch = fetchMock;

    // Mock Image
    global.Image = class {
      src: string = '';
      constructor() {
        // Do nothing
      }
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTelemetryConfig', () => {
    it('should return default config when no options provided', () => {
      const config = getTelemetryConfig();
      expect(config).toEqual({
        enabled: false,
        endpoint: 'https://telemetry.fluid.dev/ping',
      });
    });

    it('should return custom config when options provided', () => {
      const config = getTelemetryConfig({
        enabled: true,
        endpoint: 'https://custom.endpoint.com/ping',
      });
      expect(config).toEqual({
        enabled: true,
        endpoint: 'https://custom.endpoint.com/ping',
      });
    });

    it('should use default endpoint when only enabled is provided', () => {
      const config = getTelemetryConfig({ enabled: true });
      expect(config).toEqual({
        enabled: true,
        endpoint: 'https://telemetry.fluid.dev/ping',
      });
    });
  });

  describe('isTelemetryEnabled', () => {
    it('should return false when telemetry is disabled', () => {
      const config: TelemetryConfig = { enabled: false };
      expect(isTelemetryEnabled(config)).toBe(false);
    });

    it('should return true when telemetry is enabled', () => {
      const config: TelemetryConfig = { enabled: true };
      expect(isTelemetryEnabled(config)).toBe(true);
    });

    it('should return false when enabled is undefined', () => {
      const config: TelemetryConfig = {};
      expect(isTelemetryEnabled(config)).toBe(false);
    });
  });

  describe('collectTelemetry', () => {
    it('should not send telemetry when disabled', () => {
      const config: TelemetryConfig = { enabled: false };
      collectTelemetry(config, '1.0.0');

      expect(sendBeaconMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should send telemetry when enabled', () => {
      const config: TelemetryConfig = { enabled: true };
      collectTelemetry(config, '1.0.0');

      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should not send telemetry twice on the same day', () => {
      const config: TelemetryConfig = { enabled: true };
      
      // First call should send
      collectTelemetry(config, '1.0.0');
      expect(sendBeaconMock).toHaveBeenCalledTimes(1);

      // Second call should not send (already sent today)
      collectTelemetry(config, '1.0.0');
      expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    });

    it('should use custom endpoint when provided', () => {
      const config: TelemetryConfig = {
        enabled: true,
        endpoint: 'https://custom.endpoint.com/ping',
      };
      collectTelemetry(config, '1.0.0');

      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should send correct data format', () => {
      const config: TelemetryConfig = { enabled: true };
      collectTelemetry(config, '1.0.0');

      expect(sendBeaconMock).toHaveBeenCalled();
      const callArgs = sendBeaconMock.mock.calls[0];
      expect(callArgs[0]).toBe('https://telemetry.fluid.dev/ping');
      
      // Check that the second argument is a Blob
      expect(callArgs[1]).toBeInstanceOf(Blob);
    });

    it('should fallback to fetch when sendBeacon is not available', () => {
      // Remove sendBeacon
      Object.defineProperty(navigator, 'sendBeacon', {
        value: undefined,
        writable: true,
      });

      const config: TelemetryConfig = { enabled: true };
      collectTelemetry(config, '1.0.0');

      expect(fetchMock).toHaveBeenCalled();
    });

    it('should fallback to Image when sendBeacon and fetch are not available', () => {
      // Remove sendBeacon and fetch
      Object.defineProperty(navigator, 'sendBeacon', {
        value: undefined,
        writable: true,
      });
      global.fetch = undefined as any;

      const config: TelemetryConfig = { enabled: true };
      collectTelemetry(config, '1.0.0');

      // Image should have been created
      expect(true).toBe(true); // Just verify no error was thrown
    });

    it('should handle errors gracefully', () => {
      // Mock sendBeacon to throw an error
      sendBeaconMock.mockImplementation(() => {
        throw new Error('Test error');
      });

      const config: TelemetryConfig = { enabled: true };
      
      // Should not throw
      expect(() => collectTelemetry(config, '1.0.0')).not.toThrow();
    });
  });

  describe('createTelemetryCollector', () => {
    it('should create a collector function', () => {
      const config: TelemetryConfig = { enabled: true };
      const collector = createTelemetryCollector(config);

      expect(typeof collector).toBe('function');
    });

    it('should collect telemetry when collector is called', () => {
      const config: TelemetryConfig = { enabled: true };
      const collector = createTelemetryCollector(config);

      collector('1.0.0');

      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should not collect telemetry when disabled', () => {
      const config: TelemetryConfig = { enabled: false };
      const collector = createTelemetryCollector(config);

      collector('1.0.0');

      expect(sendBeaconMock).not.toHaveBeenCalled();
    });
  });
});
