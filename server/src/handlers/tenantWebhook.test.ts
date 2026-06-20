import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateWebhookHandler } from "./tenantWebhook";
import { prisma } from "../utils/db";

vi.mock("../utils/db", () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockPrisma = prisma as any;

describe("updateWebhookHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates webhook url and secret without returning the secret", async () => {
    const updatedAt = new Date("2026-03-27T15:30:00.000Z");
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      name: "Tenant One",
      webhookEventTypes: null,
      webhookSecret: null,
      webhookUrl: null,
      updatedAt,
    });
    mockPrisma.tenant.update.mockResolvedValue({
      id: "tenant-1",
      name: "Tenant One",
      webhookEventTypes: JSON.stringify(["tx.success", "tx.failed"]),
      webhookSecret: "super-secret",
      webhookUrl: "https://example.com/webhooks/paymaster",
      updatedAt,
    });

    const req: any = {
      body: {
        eventTypes: ["tx.success", "tx.failed"],
        webhookSecret: "super-secret",
        webhookUrl: "https://example.com/webhooks/paymaster",
      },
    };
    const res: any = {
      locals: {
        apiKey: {
          tenantId: "tenant-1",
        },
      },
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    await updateWebhookHandler(req, res, next);

    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: {
        id: true,
        name: true,
        webhookUrl: true,
        webhookEventTypes: true,
        webhookSecret: true,
        updatedAt: true,
      },
    });
    expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: {
        webhookEventTypes: JSON.stringify(["tx.success", "tx.failed"]),
        webhookSecret: "super-secret",
        webhookUrl: "https://example.com/webhooks/paymaster",
      },
      select: {
        id: true,
        name: true,
        webhookEventTypes: true,
        webhookSecret: true,
        webhookUrl: true,
        updatedAt: true,
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      eventTypes: ["tx.success", "tx.failed"],
      tenantId: "tenant-1",
      tenantName: "Tenant One",
      updatedAt: updatedAt.toISOString(),
      webhookSecretConfigured: true,
      webhookUrl: "https://example.com/webhooks/paymaster",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an empty patch body", async () => {
    const req: any = {
      body: {},
    };
    const res: any = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    await updateWebhookHandler(req, res, next);

    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Object),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("preserves existing event types when only rotating the secret", async () => {
    const updatedAt = new Date("2026-03-27T15:31:00.000Z");
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      name: "Tenant One",
      webhookEventTypes: JSON.stringify(["tx.failed"]),
      webhookSecret: "old-secret",
      webhookUrl: "https://example.com/webhooks/paymaster",
      updatedAt,
    });
    mockPrisma.tenant.update.mockResolvedValue({
      id: "tenant-1",
      name: "Tenant One",
      webhookEventTypes: JSON.stringify(["tx.failed"]),
      webhookSecret: "new-secret",
      webhookUrl: "https://example.com/webhooks/paymaster",
      updatedAt,
    });

    const req: any = {
      body: {
        webhookSecret: "new-secret",
      },
    };
    const res: any = {
      locals: {
        apiKey: {
          tenantId: "tenant-1",
        },
      },
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    await updateWebhookHandler(req, res, vi.fn());

    expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookEventTypes: JSON.stringify(["tx.failed"]),
          webhookSecret: "new-secret",
          webhookUrl: "https://example.com/webhooks/paymaster",
        }),
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      eventTypes: ["tx.failed"],
      tenantId: "tenant-1",
      tenantName: "Tenant One",
      updatedAt: updatedAt.toISOString(),
      webhookSecretConfigured: true,
      webhookUrl: "https://example.com/webhooks/paymaster",
    });
  });
});
