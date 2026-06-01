import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { 
  listFlaggedEventsHandler,
  getFlaggedEventHandler,
  updateFlaggedEventHandler,
  getAnomalyStatsHandler
} from "./adminFlaggedEvents";
import { Request, Response } from "express";
import prisma from "../utils/db";

// Mock the admin token validation
vi.mock("../utils/db", () => ({
  default: {
    flaggedEvent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn()
    },
    transaction: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    apiKey: {
      updateMany: vi.fn()
    },
    tenant: {
      findUnique: vi.fn()
    }
  }
}));

// Mock environment variable
process.env.FLUID_ADMIN_TOKEN = "test-admin-token";

describe("Admin Flagged Events Handlers", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: vi.Mock;
  let mockStatus: vi.Mock;

  beforeEach(() => {
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnThis();
    mockResponse = {
      json: mockJson,
      status: mockStatus
    };
    mockRequest = {
      header: vi.fn(),
      params: {},
      query: {},
      body: {}
    };
    
    vi.clearAllMocks();
  });

  describe("listFlaggedEventsHandler", () => {
    it("should return flagged events with valid admin token", async () => {
      mockRequest.header = vi.fn().mockReturnValue("test-admin-token");
      mockRequest.query = { status: "pending", limit: "10" };

      const mockEvents = [
        {
          id: "event-1",
          tenantId: "tenant-1",
          tenant: { name: "Test Tenant" },
          eventDate: new Date(),
          hourStart: new Date(),
          actualSpendStroops: BigInt(4000000),
          baselineDailyStroops: BigInt(1000000),
          multiplier: 4.0,
          riskScore: 0.8,
          status: "pending",
          metadata: null,
          adminNote: null,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      (prisma.flaggedEvent.findMany as vi.Mock).mockResolvedValue(mockEvents);

      await listFlaggedEventsHandler(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).not.toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        events: [
          {
            id: "event-1",
            tenantId: "tenant-1",
            tenantName: "Test Tenant",
            eventDate: mockEvents[0].eventDate,
            hourStart: mockEvents[0].hourStart,
            actualSpendXlm: 0.4,
            baselineDailyXlm: 0.1,
            multiplier: 4.0,
            riskScore: 0.8,
            status: "pending",
            metadata: null,
            adminNote: null,
            reviewedBy: null,
            reviewedAt: null,
            createdAt: mockEvents[0].createdAt,
            updatedAt: mockEvents[0].updatedAt
          }
        ],
        total: 1
      });
    });

    it("should return 401 with invalid admin token", async () => {
      mockRequest.header = vi.fn().mockReturnValue("invalid-token");

      await listFlaggedEventsHandler(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it("should handle database errors", async () => {
      mockRequest.header = vi.fn().mockReturnValue("test-admin-token");
      (prisma.flaggedEvent.findMany as vi.Mock).mockRejectedValue(new Error("Database error"));

      await listFlaggedEventsHandler(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: "Database error"
      });
    });
  });

  describe("getFlaggedEventHandler", () => {
    it("should return specific flagged event with transaction history", async () => {
      mockRequest.header = vi.fn().mockReturnValue("test-admin-token");
      mockRequest.params = { id: "event-1" };

      const mockEvent = {
        id: "event-1",
        tenantId: "tenant-1",
        tenant: { 
          name: "Test Tenant",
          subscriptionTier: { name: "Pro" }
        },
        eventDate: new Date(),
        hourStart: new Date(),
        actualSpendStroops: BigInt(4000000),
        baselineDailyStroops: BigInt(1000000),
        multiplier: 4.0,
        riskScore: 0.8,
        status: "pending",
        metadata: '{"test": "data"}',
        adminNote: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockTransactions = [
        {
          id: "tx-1",
          costStroops: BigInt(2000000),
          status: "SUCCESS",
          category: "Payment",
          createdAt: new Date()
        }
      ];

      (prisma.flaggedEvent.findUnique as vi.Mock).mockResolvedValue(mockEvent);
      (prisma.transaction.findMany as vi.Mock).mockResolvedValue(mockTransactions);

      await getFlaggedEventHandler(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        id: "event-1",
        tenantId: "tenant-1",
        tenantName: "Test Tenant",
        tenantTier: "Pro",
        eventDate: mockEvent.eventDate,
        hourStart: mockEvent.hourStart,
        actualSpendXlm: 0.4,
        baselineDailyXlm: 0.1,
        multiplier: 4.0,
        riskScore: 0.8,
        status: "pending",
        metadata: { test: "data" },
        adminNote: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: mockEvent.createdAt,
        updatedAt: mockEvent.updatedAt,
        recentTransactions: [
          {
            id: "tx-1",
            costXlm: 0.2,
            status: "SUCCESS",
            category: "Payment",
            createdAt: mockTransactions[0].createdAt
          }
        ]
      });
    });

    it("should return 404 for non-existent event", async () => {
      mockRequest.header = vi.fn().mockReturnValue("test-admin-token");
      mockRequest.params = { id: "non-existent" };

      (prisma.flaggedEvent.findUnique as vi.Mock).mockResolvedValue(null);

      await getFlaggedEventHandler(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: "Flagged event not found" });
    });
  });

  describe("updateFlaggedEventHandler", () => {
    it("should update flagged event status", async () => {
      mockRequest.header = vi.fn().mockReturnValue("test-admin-token");
      mockRequest.params = { id: "event-1" };
      mockRequest.body = {
        status: "approved",
        adminNote: "Reviewed and approved",
        reviewedBy: "admin-1"
      };

      const mockUpdatedEvent = {
        id: "event-1",
        status: "approved",
        adminNote: "Reviewed and approved",
        reviewedBy: "admin-1",
        reviewedAt: new Date()
      };

      (prisma.flaggedEvent.update as vi.Mock).mockResolvedValue(mockUpdatedEvent);

      await updateFlaggedEventHandler(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        id: "event-1",
        status: "approved",
        adminNote: "Reviewed and approved",
        reviewedBy: "admin-1",
        reviewedAt: mockUpdatedEvent.reviewedAt
      });
    });

    it("should disable API keys when blocking tenant", async () => {
      mockRequest.header = vi.fn().mockReturnValue("test-admin-token");
      mockRequest.params = { id: "event-1" };
      mockRequest.body = { status: "blocked" };

      const mockUpdatedEvent = {
        id: "event-1",
        status: "blocked",
        tenantId: "tenant-1"
      };

      (prisma.flaggedEvent.update as vi.Mock).mockResolvedValue(mockUpdatedEvent);

      await updateFlaggedEventHandler(mockRequest as Request, mockResponse as Response);

      expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1" },
        data: { active: false }
      });
    });

    it("should return 400 for invalid status", async () => {
      mockRequest.header = vi.fn().mockReturnValue("test-admin-token");
      mockRequest.body = { status: "invalid-status" };

      await updateFlaggedEventHandler(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: "Invalid status. Must be: approved, blocked, or dismissed"
      });
    });
  });

  describe("getAnomalyStatsHandler", () => {
    it("should return anomaly statistics", async () => {
      mockRequest.header = vi.fn().mockReturnValue("test-admin-token");

      (prisma.flaggedEvent.count as vi.Mock)
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(10) // approved
        .mockResolvedValueOnce(3)  // blocked
        .mockResolvedValueOnce(2)  // dismissed
        .mockResolvedValueOnce(1)  // last 24h
        .mockResolvedValueOnce(20); // last 7d

      const mockHighRiskEvents = [
        {
          id: "high-risk-1",
          tenantId: "tenant-1",
          riskScore: 0.9,
          multiplier: 5.0,
          tenant: { name: "High Risk Tenant" }
        }
      ];

      (prisma.flaggedEvent.findMany as vi.Mock).mockResolvedValue(mockHighRiskEvents);

      await getAnomalyStatsHandler(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        summary: {
          pending: 5,
          approved: 10,
          blocked: 3,
          dismissed: 2,
          last24Hours: 1,
          last7Days: 20
        },
        highRiskEvents: [
          {
            id: "high-risk-1",
            tenantId: "tenant-1",
            tenantName: "High Risk Tenant",
            riskScore: 0.9,
            multiplier: 5.0
          }
        ]
      });
    });

    it("should return 401 for unauthorized access", async () => {
      mockRequest.header = vi.fn().mockReturnValue("invalid-token");

      await getAnomalyStatsHandler(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: "Unauthorized" });
    });
  });
});
