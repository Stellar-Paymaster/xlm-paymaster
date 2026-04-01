import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/db", () => ({
  default: {
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    apiKey: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    pendingRegistration: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  },
}));

vi.mock("../middleware/apiKeys", () => ({
  deleteApiKey: vi.fn(),
}));

vi.mock("./auditLogger", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  serializeError: (error: unknown) => ({ message: String(error) }),
}));

import prisma from "../utils/db";
import { deleteApiKey } from "../middleware/apiKeys";
import { logAuditEvent } from "./auditLogger";
import {
  purgeExpiredTenantErasures,
  requestTenantErasure,
} from "./tenantErasure";

const mockPrisma = prisma as any;

describe("tenantErasure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("RESEND_EMAIL_FROM", "noreply@fluid.dev");

    mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
      callback({
        tenant: mockPrisma.tenant,
        apiKey: mockPrisma.apiKey,
        pendingRegistration: mockPrisma.pendingRegistration,
        transaction: mockPrisma.transaction,
      }),
    );

    mockPrisma.$queryRawUnsafe.mockImplementation(async (query: string) => {
      if (query.includes("PRAGMA table_info")) {
        return [
          { name: "id" },
          { name: "target" },
          { name: "payload" },
          { name: "metadata" },
          { name: "aiSummary" },
        ];
      }

      if (query.includes(`SELECT name FROM sqlite_master`)) {
        return [
          { name: "Tenant" },
          { name: "ApiKey" },
          { name: "WebhookDelivery" },
          { name: "Transaction" },
        ];
      }

      if (query.includes(`SELECT "id", "target", "payload", "metadata", "aiSummary" FROM "AuditLog"`)) {
        return [
          {
            id: "audit-1",
            target: "tenant-123",
            payload: "owner@example.com used key live_abc123",
            metadata: "Acme Labs",
            aiSummary: "Acme Labs rotated live_abc123",
          },
        ];
      }

      return [];
    });
    mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("soft deletes the tenant, anonymises transactions, revokes keys, and sends a confirmation email", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-123",
      name: "Acme Labs",
      contactEmail: null,
      deletedAt: null,
      scheduledPurgeAt: null,
    });
    mockPrisma.apiKey.findMany.mockResolvedValue([
      { key: "live_abc123" },
      { key: "live_def456" },
    ]);
    mockPrisma.pendingRegistration.findFirst.mockResolvedValue({
      email: "owner@example.com",
    });
    mockPrisma.transaction.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.apiKey.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.pendingRegistration.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.tenant.update.mockResolvedValue({});

    const result = await requestTenantErasure({
      tenantId: "tenant-123",
      actor: "admin-token",
    });

    expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-123" },
      data: { tenantId: null },
    });
    expect(mockPrisma.apiKey.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-123" },
    });
    expect(mockPrisma.pendingRegistration.deleteMany).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
    });
    expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tenant-123" },
        data: expect.objectContaining({
          name: "Deleted tenant",
          contactEmail: null,
          deletedAt: expect.any(Date),
          erasureRequestedAt: expect.any(Date),
          scheduledPurgeAt: expect.any(Date),
        }),
      }),
    );
    expect(deleteApiKey).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`UPDATE "AuditLog" SET`),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      "audit-1",
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      "TENANT_ERASURE_REQUESTED",
      "admin-token",
      expect.objectContaining({
        tenantId: "[redacted]",
      }),
    );
    expect(result.tenantId).toBe("tenant-123");
    expect(result.confirmationEmailSent).toBe(true);
    expect(result.alreadyScheduled).toBe(false);
  });

  it("is idempotent when the tenant is already soft deleted", async () => {
    const deletedAt = new Date("2026-03-29T18:20:00.000Z");
    const scheduledPurgeAt = new Date("2026-04-28T18:20:00.000Z");

    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-123",
      name: "Deleted tenant",
      contactEmail: null,
      deletedAt,
      scheduledPurgeAt,
    });

    const result = await requestTenantErasure({
      tenantId: "tenant-123",
      actor: "admin-token",
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.alreadyScheduled).toBe(true);
    expect(result.deletedAt).toBe(deletedAt.toISOString());
    expect(result.scheduledPurgeAt).toBe(scheduledPurgeAt.toISOString());
  });

  it("hard deletes tenants whose purge date has elapsed", async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([
      { id: "tenant-123" },
      { id: "tenant-456" },
    ]);
    mockPrisma.tenant.delete.mockResolvedValue({});

    const purgedCount = await purgeExpiredTenantErasures(
      new Date("2026-04-30T00:00:00.000Z"),
    );

    expect(mockPrisma.tenant.delete).toHaveBeenCalledTimes(2);
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      `DELETE FROM "WebhookDelivery" WHERE "tenantId" = ?`,
      "tenant-123",
    );
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      `UPDATE "Transaction" SET "tenantId" = NULL WHERE "tenantId" = ?`,
      "tenant-456",
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      "TENANT_ERASURE_PURGED",
      "system",
      expect.objectContaining({
        tenantId: "[redacted]",
      }),
    );
    expect(purgedCount).toBe(2);
  });
});
