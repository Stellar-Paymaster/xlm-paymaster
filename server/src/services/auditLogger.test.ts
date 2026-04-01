import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../utils/db";
import {
  ensureAuditLogTableIntegrity,
  exportAuditLogCsv,
  getAuditActor,
  logAuditEvent,
  serializeAuditRecordToCsv,
} from "./auditLogger";

vi.mock("../utils/db", () => ({
  default: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

describe("auditLogger", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "file:./dev.db");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses admin user header when available", () => {
    const req = { header: (name: string) => (name === "x-admin-user" ? "alice" : null) } as any;
    expect(getAuditActor(req)).toBe("admin:alice");
  });

  it("falls back to admin-token for auth header", () => {
    const req = { header: (name: string) => (name === "x-admin-token" ? "secret" : null) } as any;
    expect(getAuditActor(req)).toBe("admin-token");
  });

  it("serializes audit records to CSV escaping commas and quotes", () => {
    const row = serializeAuditRecordToCsv({
      eventType: "API_KEY_REVOKE",
      actor: "admin-token",
      payload: { key: "abcd,ef" },
      timestamp: new Date("2026-03-29T12:34:56Z"),
    });
    expect(row).toContain("\"abcd,ef\"");
    expect(row).toContain("2026-03-29T12:34:56.000Z");
  });

  it("exports audit records as CSV", async () => {
    const expectedRows = [
      {
        eventType: "API_KEY_REVOKE",
        actor: "admin-token",
        payload: { key: "test" },
        timestamp: new Date("2026-03-29T12:34:56Z"),
      },
    ];
    (prisma.auditLog.findMany as any).mockResolvedValue(expectedRows);

    const csv = await exportAuditLogCsv();
    expect(csv).toContain("event_type,actor,payload,timestamp");
    expect(csv).toContain("API_KEY_REVOKE");
  });

  it("ensures audit log table structure is created for sqlite", async () => {
    await ensureAuditLogTableIntegrity();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(8);
    expect((prisma.$executeRawUnsafe as any).mock.calls[0][0]).toContain("CREATE TABLE IF NOT EXISTS \"AuditLog\"");
    expect((prisma.$executeRawUnsafe as any).mock.calls[6][0]).toContain("DROP TRIGGER IF EXISTS audit_log_no_update");
    expect((prisma.$executeRawUnsafe as any).mock.calls[7][0]).toContain("DROP TRIGGER IF EXISTS audit_log_no_delete");
  });

  it("logs an audit event without throwing", async () => {
    (prisma.auditLog.create as any).mockResolvedValue({});
    await expect(logAuditEvent("ADMIN_LOGIN", "admin-token", { path: "/admin" })).resolves.toBeUndefined();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
