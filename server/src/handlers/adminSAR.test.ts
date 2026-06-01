import { describe, it, expect, beforeEach, vi } from "vitest";
import { Request, Response } from "express";
import {
  listSARReportsHandler,
  getSARReportHandler,
  reviewSARReportHandler,
  getSARStatsHandler,
  exportSARReportsHandler
} from "./adminSAR";
import { prisma } from "../utils/db";

vi.mock("../utils/db", () => ({
  prisma: {
    sARReport: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn()
    },
    transaction: {
      findMany: vi.fn()
    }
  }
}));

process.env.FLUID_ADMIN_TOKEN = "test-admin-token";

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    header: vi.fn().mockReturnValue("test-admin-token"),
    params: {},
    query: {},
    body: {},
    ...overrides
  };
}

function makeRes(): { res: Partial<Response>; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const send = vi.fn();
  const setHeader = vi.fn();
  const status = vi.fn().mockReturnThis();
  const res: Partial<Response> = { json, status, setHeader, send } as any;
  return { res, json, status, setHeader, send };
}

const mockReport = {
  id: "sar-1",
  transactionId: "tx-1",
  tenantId: "tenant-1",
  ruleCode: "HIGH_FREQUENCY",
  reason: "52 transactions in 60s window",
  status: "pending_review",
  adminNote: null,
  reviewedBy: null,
  reviewedAt: null,
  metadata: '{"count":52,"windowSeconds":60}',
  createdAt: new Date("2026-03-29T10:00:00Z"),
  updatedAt: new Date("2026-03-29T10:00:00Z"),
  tenant: { name: "Test Tenant" },
  transaction: {
    txHash: "abc123",
    innerTxHash: "def456",
    costStroops: BigInt(120000),
    category: "Token Transfer",
    chain: "stellar",
    createdAt: new Date("2026-03-29T09:59:00Z")
  }
};

describe("listSARReportsHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns SAR reports with valid admin token", async () => {
    const req = makeReq({ query: { status: "pending_review", limit: "10" } });
    const { res, json, status } = makeRes();
    (prisma.sARReport.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockReport]);

    await listSARReportsHandler(req as Request, res as Response);

    expect(status).not.toHaveBeenCalled();
    const call = json.mock.calls[0][0];
    expect(call.total).toBe(1);
    expect(call.reports[0].ruleCode).toBe("HIGH_FREQUENCY");
    expect(call.reports[0].tenantName).toBe("Test Tenant");
    expect(call.reports[0].metadata).toEqual({ count: 52, windowSeconds: 60 });
  });

  it("returns 401 with invalid admin token", async () => {
    const req = makeReq({ header: vi.fn().mockReturnValue("wrong-token") });
    const { res, json, status } = makeRes();

    await listSARReportsHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("handles database errors", async () => {
    const req = makeReq();
    const { res, json, status } = makeRes();
    (prisma.sARReport.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    await listSARReportsHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: "DB error" });
  });
});

describe("getSARReportHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns SAR report with context transactions", async () => {
    const req = makeReq({ params: { id: "sar-1" } });
    const { res, json, status } = makeRes();

    const fullReport = {
      ...mockReport,
      tenant: {
        name: "Test Tenant",
        subscriptionTier: { name: "Pro" }
      },
      transaction: {
        ...mockReport.transaction,
        status: "SUCCESS"
      }
    };
    (prisma.sARReport.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fullReport);
    (prisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getSARReportHandler(req as Request, res as Response);

    expect(status).not.toHaveBeenCalledWith(expect.not.stringContaining("200"));
    const result = json.mock.calls[0][0];
    expect(result.id).toBe("sar-1");
    expect(result.ruleCode).toBe("HIGH_FREQUENCY");
    expect(result.tenantTier).toBe("Pro");
    expect(result.contextTransactions).toEqual([]);
  });

  it("returns 404 for non-existent SAR report", async () => {
    const req = makeReq({ params: { id: "nonexistent" } });
    const { res, json, status } = makeRes();
    (prisma.sARReport.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await getSARReportHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: "SAR report not found" });
  });
});

describe("reviewSARReportHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks report as confirmed_suspicious", async () => {
    const req = makeReq({
      params: { id: "sar-1" },
      body: { status: "confirmed_suspicious", adminNote: "Verified attack", reviewedBy: "admin-1" }
    });
    const { res, json, status } = makeRes();

    const updated = {
      id: "sar-1",
      status: "confirmed_suspicious",
      adminNote: "Verified attack",
      reviewedBy: "admin-1",
      reviewedAt: new Date()
    };
    (prisma.sARReport.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    await reviewSARReportHandler(req as Request, res as Response);

    expect(status).not.toHaveBeenCalledWith(400);
    const result = json.mock.calls[0][0];
    expect(result.status).toBe("confirmed_suspicious");
    expect(result.adminNote).toBe("Verified attack");
  });

  it("marks report as false_positive", async () => {
    const req = makeReq({
      params: { id: "sar-1" },
      body: { status: "false_positive", reviewedBy: "admin-2" }
    });
    const { res, json, status } = makeRes();
    (prisma.sARReport.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sar-1",
      status: "false_positive",
      adminNote: null,
      reviewedBy: "admin-2",
      reviewedAt: new Date()
    });

    await reviewSARReportHandler(req as Request, res as Response);

    const result = json.mock.calls[0][0];
    expect(result.status).toBe("false_positive");
  });

  it("returns 400 for invalid review status", async () => {
    const req = makeReq({
      params: { id: "sar-1" },
      body: { status: "invalid-status" }
    });
    const { res, json, status } = makeRes();

    await reviewSARReportHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].error).toMatch(/confirmed_suspicious/);
  });

  it("returns 404 for missing report", async () => {
    const req = makeReq({
      params: { id: "nonexistent" },
      body: { status: "false_positive" }
    });
    const { res, json, status } = makeRes();
    (prisma.sARReport.update as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Record to update not found")
    );

    await reviewSARReportHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(404);
  });
});

describe("getSARStatsHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns SAR summary statistics", async () => {
    const req = makeReq();
    const { res, json } = makeRes();

    (prisma.sARReport.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(5)   // pending
      .mockResolvedValueOnce(12)  // confirmed
      .mockResolvedValueOnce(3)   // false_positive
      .mockResolvedValueOnce(2)   // last 24h
      .mockResolvedValueOnce(18); // last 7d
    (prisma.sARReport.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ruleCode: "HIGH_FREQUENCY", _count: { id: 3 } },
      { ruleCode: "HIGH_SOROBAN_FEE", _count: { id: 2 } }
    ]);

    await getSARStatsHandler(req as Request, res as Response);

    const result = json.mock.calls[0][0];
    expect(result.summary.pending).toBe(5);
    expect(result.summary.confirmed).toBe(12);
    expect(result.summary.falsePositive).toBe(3);
    expect(result.byRule).toHaveLength(2);
    expect(result.byRule[0].ruleCode).toBe("HIGH_FREQUENCY");
    expect(result.byRule[0].pendingCount).toBe(3);
  });
});

describe("exportSARReportsHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports SAR reports as CSV", async () => {
    const req = makeReq({ query: {} });
    const { res, json, setHeader, send } = makeRes();
    (prisma.sARReport.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockReport]);

    await exportSARReportsHandler(req as Request, res as Response);

    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/csv");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringMatching(/attachment; filename="sar-report-\d+\.csv"/)
    );
    const csv = send.mock.calls[0][0] as string;
    expect(csv).toContain("id,tenant_id,tenant_name");
    expect(csv).toContain("sar-1");
    expect(csv).toContain("HIGH_FREQUENCY");
    expect(csv).toContain("pending_review");
  });

  it("returns 401 without admin token", async () => {
    const req = makeReq({ header: vi.fn().mockReturnValue("bad-token") });
    const { res, json, status } = makeRes();

    await exportSARReportsHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
  });
});
