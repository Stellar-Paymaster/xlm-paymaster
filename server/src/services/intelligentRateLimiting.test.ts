import { describe, it, expect, beforeEach, vi } from "vitest";
import { TenantUsageTracker } from "../services/tenantUsageTracker";
import { IntelligentRateLimiter } from "../services/intelligentRateLimiter";
import prisma from "../utils/db";

// Mock Prisma
vi.mock("../utils/db", () => ({
  default: {
    tenantUsageStats: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    subscriptionTier: {
      findFirst: vi.fn(),
    },
    tierAdjustment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Mock logger
vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("TenantUsageTracker", () => {
  let tracker: TenantUsageTracker;

  beforeEach(() => {
    tracker = new TenantUsageTracker();
    vi.clearAllMocks();
  });

  describe("recordRequest", () => {
    it("should record a request successfully", async () => {
      const mockUpsert = vi.mocked(prisma.tenantUsageStats.upsert);
      mockUpsert.mockResolvedValue({} as any);

      await tracker.recordRequest("tenant-123");

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_date: {
              tenantId: "tenant-123",
              date: expect.any(Date),
            },
          },
          update: {
            requestCount: { increment: 1 },
            updatedAt: expect.any(Date),
          },
          create: {
            tenantId: "tenant-123",
            date: expect.any(Date),
            requestCount: 1,
          },
        })
      );
    });

    it("should handle errors gracefully", async () => {
      const mockUpsert = vi.mocked(prisma.tenantUsageStats.upsert);
      mockUpsert.mockRejectedValue(new Error("Database error"));

      // Should not throw
      await expect(tracker.recordRequest("tenant-123")).resolves.toBeUndefined();
    });
  });

  describe("recordViolation", () => {
    it("should record a violation successfully", async () => {
      const mockUpsert = vi.mocked(prisma.tenantUsageStats.upsert);
      mockUpsert.mockResolvedValue({} as any);

      await tracker.recordViolation("tenant-123");

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_date: {
              tenantId: "tenant-123",
              date: expect.any(Date),
            },
          },
          update: {
            violationCount: { increment: 1 },
            updatedAt: expect.any(Date),
          },
          create: {
            tenantId: "tenant-123",
            date: expect.any(Date),
            violationCount: 1,
          },
        })
      );
    });
  });

  describe("getUsageScore", () => {
    it("should return zero score for tenant with no history", async () => {
      const mockFindMany = vi.mocked(prisma.tenantUsageStats.findMany);
      mockFindMany.mockResolvedValue([]);

      const score = await tracker.getUsageScore("tenant-123");

      expect(score).toEqual({
        tenantId: "tenant-123",
        thirtyDayAvg: 0,
        violationFreeDays: 0,
        burstBehavior: 0,
        recommendationScore: 0,
      });
    });

    it("should calculate correct usage score for active tenant", async () => {
      const mockStats = [
        { requestCount: 100, violationCount: 0, burstScore: 0.2 },
        { requestCount: 120, violationCount: 0, burstScore: 0.1 },
        { requestCount: 80, violationCount: 0, burstScore: 0.3 },
      ];

      const mockFindMany = vi.mocked(prisma.tenantUsageStats.findMany);
      mockFindMany.mockResolvedValue(mockStats as any);

      const mockTenant = {
        subscriptionTier: { rateLimit: 200 },
      };
      const mockFindUnique = vi.mocked(prisma.tenant.findUnique);
      mockFindUnique.mockResolvedValue(mockTenant as any);

      const score = await tracker.getUsageScore("tenant-123");

      expect(score.violationFreeDays).toBe(3); // All days have 0 violations
      expect(score.recommendationScore).toBeGreaterThan(0);
      expect(score.thirtyDayAvg).toBeGreaterThan(0);
    });
  });
});

describe("IntelligentRateLimiter", () => {
  let rateLimiter: IntelligentRateLimiter;

  beforeEach(() => {
    rateLimiter = new IntelligentRateLimiter();
    vi.clearAllMocks();
  });

  describe("isEligibleForUpgrade", () => {
    it("should return false for tenant with violations", () => {
      const usageScore = {
        violationFreeDays: 7, // Less than required 14
        recommendationScore: 90,
        thirtyDayAvg: 0.5,
        burstBehavior: 0.2,
      };

      const eligible = rateLimiter["isEligibleForUpgrade"](usageScore, 0);

      expect(eligible).toBe(false);
    });

    it("should return false for tenant with low score", () => {
      const usageScore = {
        violationFreeDays: 20, // Meets requirement
        recommendationScore: 70, // Below threshold 80
        thirtyDayAvg: 0.5,
        burstBehavior: 0.2,
      };

      const eligible = rateLimiter["isEligibleForUpgrade"](usageScore, 0);

      expect(eligible).toBe(false);
    });

    it("should return true for eligible tenant", () => {
      const usageScore = {
        violationFreeDays: 20, // Meets requirement
        recommendationScore: 85, // Above threshold 80
        thirtyDayAvg: 0.6, // Within acceptable range
        burstBehavior: 0.2,
      };

      const eligible = rateLimiter["isEligibleForUpgrade"](usageScore, 0);

      expect(eligible).toBe(true);
    });
  });

  describe("adminOverrideTierAdjustment", () => {
    it("should perform admin override successfully", async () => {
      const mockTenant = {
        id: "tenant-123",
        subscriptionTier: { id: "tier-free", name: "Free" },
      };

      const mockTargetTier = {
        id: "tier-pro",
        name: "Pro",
      };

      const mockUsageScore = {
        violationFreeDays: 10,
        thirtyDayAvg: 0.5,
      };

      const mockAdjustment = {
        id: "adjustment-123",
        fromTier: { name: "Free" },
        toTier: { name: "Pro" },
      };

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(prisma.subscriptionTier.findFirst).mockResolvedValue(mockTargetTier as any);
      vi.mocked(prisma.tenant.update).mockResolvedValue({} as any);
      vi.mocked(prisma.tierAdjustment.create).mockResolvedValue(mockAdjustment as any);

      // Mock the usage tracker
      const mockGetUsageScore = vi.spyOn(rateLimiter["usageTracker"], "getUsageScore");
      mockGetUsageScore.mockResolvedValue(mockUsageScore as any);

      const result = await rateLimiter.adminOverrideTierAdjustment(
        "tenant-123",
        "Pro",
        "admin-456",
        "Manual upgrade for good customer"
      );

      expect(result).toEqual({
        tenantId: "tenant-123",
        fromTier: "Free",
        toTier: "Pro",
        reason: "Manual upgrade for good customer",
        violationFreeDays: 10,
        avgUsageScore: 0.5,
        autoAdjusted: false,
        adjustedBy: "admin-456",
      });

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-123" },
        data: { subscriptionTierId: "tier-pro" },
      });
    });
  });
});
