import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { 
  calculateBaseline, 
  checkAnomalies, 
  createFlaggedEvent,
  updateSpendBaseline,
  getCurrentHourSpend,
  runAnomalyDetection,
  getPendingFlaggedEvents
} from "./anomalyDetection";
import prisma from "../utils/db";

// Mock the logger
vi.mock("../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}));

describe("Anomaly Detection Service", () => {
  const testTenantId = "test-tenant-123";
  
  beforeEach(async () => {
    // Clean up test data
    await prisma.flaggedEvent.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.spendBaseline.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.transaction.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
    
    // Create test tenant
    await prisma.tenant.create({
      data: {
        id: testTenantId,
        name: "Test Tenant",
        subscriptionTierId: "free-tier"
      }
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.flaggedEvent.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.spendBaseline.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.transaction.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
  });

  describe("calculateBaseline", () => {
    it("should calculate baseline from recent transactions", async () => {
      // Create test transactions over the past 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(sevenDaysAgo);
        date.setDate(date.getDate() + i);
        
        await prisma.transaction.create({
          data: {
            tenantId: testTenantId,
            innerTxHash: `tx-${i}`,
            status: "SUCCESS",
            costStroops: BigInt(1000000), // 0.1 XLM per day
            createdAt: date
          }
        });
      }

      const baseline = await calculateBaseline(testTenantId);
      
      expect(baseline).not.toBeNull();
      expect(baseline!.dailyAvgStroops).toBe(BigInt(1000000));
      expect(baseline!.hourlyAvgStroops).toBe(BigInt(41666)); // ~0.1/24 XLM
      expect(baseline!.totalTransactions).toBe(7);
    });

    it("should return null for tenant with no transactions", async () => {
      const baseline = await calculateBaseline(testTenantId);
      expect(baseline).toBeNull();
    });
  });

  describe("updateSpendBaseline", () => {
    it("should create or update baseline for tenant", async () => {
      // Create test transactions
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          innerTxHash: "test-tx",
          status: "SUCCESS",
          costStroops: BigInt(2000000),
          createdAt: sevenDaysAgo
        }
      });

      await updateSpendBaseline(testTenantId);

      const baseline = await prisma.spendBaseline.findUnique({
        where: { tenantId: testTenantId }
      });

      expect(baseline).not.toBeNull();
      expect(baseline!.dailyAvgStroops).toBe(BigInt(2000000));
    });
  });

  describe("getCurrentHourSpend", () => {
    it("should calculate spend for current hour", async () => {
      const now = new Date();
      const hourStart = new Date(now);
      hourStart.setMinutes(0, 0, 0);

      // Create transactions in current hour
      await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          innerTxHash: "tx-1",
          status: "SUCCESS",
          costStroops: BigInt(500000),
          createdAt: new Date(hourStart.getTime() + 10 * 60 * 1000) // 10 minutes into hour
        }
      });

      await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          innerTxHash: "tx-2",
          status: "SUCCESS",
          costStroops: BigInt(300000),
          createdAt: new Date(hourStart.getTime() + 20 * 60 * 1000) // 20 minutes into hour
        }
      });

      const currentSpend = await getCurrentHourSpend(testTenantId);
      expect(currentSpend).toBe(BigInt(800000));
    });

    it("should not include transactions from previous hours", async () => {
      const now = new Date();
      const previousHour = new Date(now);
      previousHour.setHours(previousHour.getHours() - 1);
      previousHour.setMinutes(0, 0, 0);

      await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          innerTxHash: "old-tx",
          status: "SUCCESS",
          costStroops: BigInt(1000000),
          createdAt: previousHour
        }
      });

      const currentSpend = await getCurrentHourSpend(testTenantId);
      expect(currentSpend).toBe(BigInt(0));
    });
  });

  describe("checkAnomalies", () => {
    beforeEach(async () => {
      // Create baseline for testing
      await prisma.spendBaseline.create({
        data: {
          tenantId: testTenantId,
          dailyAvgStroops: BigInt(1000000), // 0.1 XLM daily average
          hourlyAvgStroops: BigInt(41666),
          totalTransactions: 10
        }
      });
    });

    it("should detect anomaly when spend exceeds threshold", async () => {
      const now = new Date();
      const hourStart = new Date(now);
      hourStart.setMinutes(0, 0, 0);

      // Create transactions that exceed 3x daily average (3 * 0.1 = 0.3 XLM)
      await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          innerTxHash: "high-spend-tx",
          status: "SUCCESS",
          costStroops: BigInt(4000000), // 0.4 XLM - exceeds 3x threshold
          createdAt: hourStart
        }
      });

      const anomaly = await checkAnomalies(testTenantId);
      
      expect(anomaly).not.toBeNull();
      expect(anomaly!.multiplier).toBeGreaterThan(3.0);
      expect(anomaly!.actualSpendStroops).toBe(BigInt(4000000));
      expect(anomaly!.baselineDailyStroops).toBe(BigInt(1000000));
    });

    it("should not detect anomaly when spend is normal", async () => {
      const now = new Date();
      const hourStart = new Date(now);
      hourStart.setMinutes(0, 0, 0);

      // Create normal spending (less than 3x daily average)
      await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          innerTxHash: "normal-tx",
          status: "SUCCESS",
          costStroops: BigInt(200000), // 0.02 XLM - well below threshold
          createdAt: hourStart
        }
      });

      const anomaly = await checkAnomalies(testTenantId);
      expect(anomaly).toBeNull();
    });

    it("should return null when no baseline exists", async () => {
      await prisma.spendBaseline.delete({ where: { tenantId: testTenantId } });
      
      const anomaly = await checkAnomalies(testTenantId);
      expect(anomaly).toBeNull();
    });
  });

  describe("createFlaggedEvent", () => {
    it("should create flagged event with correct data", async () => {
      const eventData = {
        tenantId: testTenantId,
        hourStart: new Date(),
        actualSpendStroops: BigInt(4000000),
        baselineDailyStroops: BigInt(1000000),
        multiplier: 4.0,
        riskScore: 0.8,
        metadata: { test: "data" }
      };

      await createFlaggedEvent(eventData);

      const event = await prisma.flaggedEvent.findFirst({
        where: { tenantId: testTenantId }
      });

      expect(event).not.toBeNull();
      expect(event!.actualSpendStroops).toBe(BigInt(4000000));
      expect(event!.baselineDailyStroops).toBe(BigInt(1000000));
      expect(event!.multiplier).toBe(4.0);
      expect(event!.riskScore).toBe(0.8);
      expect(event!.status).toBe("pending");
      expect(JSON.parse(event!.metadata!)).toEqual({ test: "data" });
    });
  });

  describe("getPendingFlaggedEvents", () => {
    it("should return only pending flagged events", async () => {
      // Create multiple events with different statuses
      await prisma.flaggedEvent.createMany({
        data: [
          {
            tenantId: testTenantId,
            eventDate: new Date(),
            hourStart: new Date(),
            actualSpendStroops: BigInt(1000000),
            baselineDailyStroops: BigInt(300000),
            multiplier: 3.33,
            riskScore: 0.7,
            status: "pending"
          },
          {
            tenantId: testTenantId,
            eventDate: new Date(),
            hourStart: new Date(),
            actualSpendStroops: BigInt(2000000),
            baselineDailyStroops: BigInt(500000),
            multiplier: 4.0,
            riskScore: 0.8,
            status: "approved"
          },
          {
            tenantId: testTenantId,
            eventDate: new Date(),
            hourStart: new Date(),
            actualSpendStroops: BigInt(1500000),
            baselineDailyStroops: BigInt(400000),
            multiplier: 3.75,
            riskScore: 0.75,
            status: "pending"
          }
        ]
      });

      const pendingEvents = await getPendingFlaggedEvents();
      
      expect(pendingEvents).toHaveLength(2);
      expect(pendingEvents.every(event => event.status === "pending")).toBe(true);
    });
  });

  describe("runAnomalyDetection", () => {
    it("should process all active tenants and create flagged events", async () => {
      // Create another tenant with recent activity
      const otherTenantId = "other-tenant-456";
      await prisma.tenant.create({
        data: {
          id: otherTenantId,
          name: "Other Tenant",
          subscriptionTierId: "free-tier"
        }
      });

      // Create baselines for both tenants
      await prisma.spendBaseline.createMany({
        data: [
          {
            tenantId: testTenantId,
            dailyAvgStroops: BigInt(1000000),
            hourlyAvgStroops: BigInt(41666),
            totalTransactions: 10
          },
          {
            tenantId: otherTenantId,
            dailyAvgStroops: BigInt(500000),
            hourlyAvgStroops: BigInt(20833),
            totalTransactions: 5
          }
        ]
      });

      // Create recent sponsored transactions to make them "active"
      await prisma.sponsoredTransaction.createMany({
        data: [
          {
            tenantId: testTenantId,
            feeStroops: BigInt(100000),
            createdAt: new Date()
          },
          {
            tenantId: otherTenantId,
            feeStroops: BigInt(50000),
            createdAt: new Date()
          }
        ]
      });

      // Create anomalous spending for first tenant
      const now = new Date();
      const hourStart = new Date(now);
      hourStart.setMinutes(0, 0, 0);

      await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          innerTxHash: "anomaly-tx",
          status: "SUCCESS",
          costStroops: BigInt(4000000), // 4x daily average
          createdAt: hourStart
        }
      });

      await runAnomalyDetection();

      // Check that flagged event was created for the anomalous tenant
      const flaggedEvents = await prisma.flaggedEvent.findMany({
        where: { tenantId: testTenantId }
      });

      expect(flaggedEvents).toHaveLength(1);
      expect(flaggedEvents[0].multiplier).toBeGreaterThan(3.0);

      // Clean up other tenant
      await prisma.sponsoredTransaction.deleteMany({ where: { tenantId: otherTenantId } });
      await prisma.spendBaseline.delete({ where: { tenantId: otherTenantId } });
      await prisma.tenant.delete({ where: { id: otherTenantId } });
    });
  });
});
