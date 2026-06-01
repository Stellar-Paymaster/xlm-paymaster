import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusMonitorService } from '../services/statusMonitorService';
import prisma from '../utils/db';

// Mock dependencies
vi.mock('../utils/db', () => ({
  default: {
    statusEvent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    statusSubscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@stellar/stellar-sdk', () => {
  const mockServer = vi.fn().mockImplementation(function() {
    return {
      serverInfo: vi.fn().mockResolvedValue({
        ledger: 12345,
        protocol_version: 18,
      }),
    };
  });
  return {
    Server: mockServer,
    default: {
      Server: mockServer,
    },
  };
});

describe('StatusMonitorService', () => {
  let statusMonitor: StatusMonitorService;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      horizonUrl: 'https://horizon-testnet.stellar.org',
    };
    statusMonitor = new StatusMonitorService(prisma, mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with prisma and config', () => {
      expect(statusMonitor).toBeDefined();
    });
  });

  describe('getCurrentStatus', () => {
    it('should return current status for all components', async () => {
      const mockApiStatus = {
        component: 'api',
        status: 'operational',
        lastUpdated: new Date(),
      };

      const mockHorizonStatus = {
        component: 'horizon',
        status: 'operational',
        lastUpdated: new Date(),
      };

      const mockDbStatus = {
        component: 'database',
        status: 'operational',
        lastUpdated: new Date(),
      };

      (prisma.statusEvent.findFirst as any)
        .mockResolvedValueOnce(mockApiStatus)
        .mockResolvedValueOnce(mockHorizonStatus)
        .mockResolvedValueOnce(mockDbStatus);

      const result = await statusMonitor.getCurrentStatus();

      expect(result).toEqual({
        status: 'operational',
        timestamp: expect.any(String),
        components: {
          api: mockApiStatus,
          horizon: mockHorizonStatus,
          database: mockDbStatus,
        },
      });
    });

    it('should return degraded status if any component is degraded', async () => {
      const mockApiStatus = {
        component: 'api',
        status: 'operational',
        lastUpdated: new Date(),
      };

      const mockHorizonStatus = {
        component: 'horizon',
        status: 'degraded',
        lastUpdated: new Date(),
      };

      const mockDbStatus = {
        component: 'database',
        status: 'operational',
        lastUpdated: new Date(),
      };

      (prisma.statusEvent.findFirst as any)
        .mockResolvedValueOnce(mockApiStatus)
        .mockResolvedValueOnce(mockHorizonStatus)
        .mockResolvedValueOnce(mockDbStatus);

      const result = await statusMonitor.getCurrentStatus();

      expect(result.status).toBe('degraded');
    });

    it('should return down status if any component is down', async () => {
      const mockApiStatus = {
        component: 'api',
        status: 'operational',
        lastUpdated: new Date(),
      };

      const mockHorizonStatus = {
        component: 'horizon',
        status: 'down',
        lastUpdated: new Date(),
      };

      const mockDbStatus = {
        component: 'database',
        status: 'operational',
        lastUpdated: new Date(),
      };

      (prisma.statusEvent.findFirst as any)
        .mockResolvedValueOnce(mockApiStatus)
        .mockResolvedValueOnce(mockHorizonStatus)
        .mockResolvedValueOnce(mockDbStatus);

      const result = await statusMonitor.getCurrentStatus();

      expect(result.status).toBe('down');
    });

    it('should return unknown status for components with no data', async () => {
      (prisma.statusEvent.findFirst as any).mockResolvedValue(null);

      const result = await statusMonitor.getCurrentStatus();

      expect(result.components.api).toEqual({
        component: 'api',
        status: 'unknown',
        message: 'No data available',
      });
    });
  });

  describe('getUptimeStats', () => {
    it('should calculate uptime statistics', async () => {
      const mockEvents = [
        {
          component: 'api',
          status: 'operational',
          createdAt: new Date('2026-03-27T12:00:00Z'),
        },
        {
          component: 'api',
          status: 'degraded',
          createdAt: new Date('2026-03-28T12:00:00Z'),
        },
        {
          component: 'horizon',
          status: 'operational',
          createdAt: new Date('2026-03-27T12:00:00Z'),
        },
      ];

      (prisma.statusEvent.findMany as any).mockResolvedValue(mockEvents);

      const result = await statusMonitor.getUptimeStats(90);

      expect(prisma.statusEvent.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: expect.any(Date),
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      expect(result).toEqual({
        period: '90 days',
        startDate: expect.any(String),
        endDate: expect.any(String),
        components: expect.any(Object),
      });
    });
  });

  describe('getIncidentHistory', () => {
    it('should return incident history', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          component: 'horizon',
          status: 'down',
          message: 'Horizon timeout',
          createdAt: new Date('2026-03-27T10:00:00Z'),
        },
        {
          id: 'event-2',
          component: 'horizon',
          status: 'operational',
          createdAt: new Date('2026-03-27T11:30:00Z'),
        },
      ];

      (prisma.statusEvent.findMany as any).mockResolvedValue(mockEvents);

      const result = await statusMonitor.getIncidentHistory(90);

      expect(prisma.statusEvent.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: expect.any(Date),
          },
          status: {
            in: ['degraded', 'down'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(result).toEqual({
        period: '90 days',
        incidents: [
          {
            id: 'event-1',
            component: 'horizon',
            status: 'down',
            message: 'Horizon timeout',
            startedAt: new Date('2026-03-27T10:00:00Z'),
            resolvedAt: new Date('2026-03-27T11:30:00Z'),
            duration: 5400000, // 1.5 hours in ms
            durationMinutes: 90,
          },
        ],
      });
    });

    it('should handle ongoing incidents', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          component: 'horizon',
          status: 'down',
          message: 'Horizon timeout',
          createdAt: new Date('2026-03-27T10:00:00Z'),
        },
      ];

      (prisma.statusEvent.findMany as any).mockResolvedValue(mockEvents);

      const result = await statusMonitor.getIncidentHistory(90);

      expect(result.incidents[0].resolvedAt).toBeNull();
      expect(result.incidents[0].durationMinutes).toBeGreaterThan(0);
    });
  });

  describe('health checks', () => {
    it('should perform API health check', async () => {
      const result = await (statusMonitor as any).checkApi();
      
      expect(result).toEqual({
        component: 'api',
        status: 'operational',
        metadata: expect.objectContaining({
          responseTime: expect.any(Number),
          timestamp: expect.any(String),
        }),
      });
    });

    it('should perform Horizon health check', async () => {
      const result = await (statusMonitor as any).checkHorizon();
      
      expect(result).toEqual({
        component: 'horizon',
        status: 'operational',
        metadata: expect.objectContaining({
          responseTime: expect.any(Number),
          horizonUrl: mockConfig.horizonUrl,
          timestamp: expect.any(String),
          horizonInfo: expect.any(Object),
        }),
      });
    });

    it('should handle Horizon timeout', async () => {
      // Mock Stellar SDK to throw timeout
      const { default: StellarSdk } = await import('@stellar/stellar-sdk');
      vi.mocked(StellarSdk.Server).mockImplementationOnce(() => ({
        serverInfo: vi.fn().mockRejectedValue(new Error('Timeout')),
      } as any));

      const result = await (statusMonitor as any).checkHorizon();
      
      expect(result.status).toBe('down');
      expect(result.message).toBe('Timeout');
    });

    it('should perform database health check', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ health_check: 1 }]);

      const result = await (statusMonitor as any).checkDatabase();
      
      expect(result).toEqual({
        component: 'database',
        status: 'operational',
        metadata: expect.objectContaining({
          responseTime: expect.any(Number),
          timestamp: expect.any(String),
        }),
      });
    });

    it('should handle database timeout', async () => {
      (prisma.$queryRaw as any).mockRejectedValue(new Error('Database timeout'));

      const result = await (statusMonitor as any).checkDatabase();
      
      expect(result.status).toBe('down');
      expect(result.message).toBe('Database timeout');
    });
  });

  describe('start and stop', () => {
    it('should start monitoring', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      await statusMonitor.start();
      
      expect(statusMonitor['isRunning']).toBe(true);
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // CHECK_INTERVAL_MS
      );
      
      setIntervalSpy.mockRestore();
    });

    it('should stop monitoring', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      await statusMonitor.start();
      await statusMonitor.stop();
      
      expect(statusMonitor['isRunning']).toBe(false);
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
    });

    it('should not start if already running', async () => {
      await statusMonitor.start();
      
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      await statusMonitor.start(); // Try to start again
      
      expect(setIntervalSpy).not.toHaveBeenCalled();
      
      await statusMonitor.stop();
      setIntervalSpy.mockRestore();
    });
  });
});
