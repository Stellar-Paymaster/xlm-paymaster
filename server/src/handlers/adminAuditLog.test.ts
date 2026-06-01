import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../utils/db", () => ({
  default: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

vi.mock("../utils/adminAuth", () => ({
  requireAdminToken: vi.fn(),
}));

vi.mock("../services/auditLogger", () => ({
  exportAuditLogCsv: vi.fn(),
}));

type ExportAuditLogHandlerModule = {
  exportAuditLogHandler: (req: Request, res: Response) => Promise<void>;
};

afterEach(() => {
  vi.clearAllMocks();
});

function makeReqRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const send = vi.fn();
  const setHeader = vi.fn();
  const res = {
    status,
    json,
    send,
    setHeader,
  } as unknown as Response;
  const req = {
    path: "/admin/audit-log/export",
    method: "GET",
  } as unknown as Request;
  return { req, res, status, json, send, setHeader };
}

describe("exportAuditLogHandler", () => {
  it("returns 401 when unauthorized", async () => {
    const { requireAdminToken } = await import("../utils/adminAuth");
    const { exportAuditLogHandler } = (await import(
      "./adminAuditLog"
    )) as ExportAuditLogHandlerModule;

    (requireAdminToken as any).mockReturnValue(false);
    const { req, res, status } = makeReqRes();
    await exportAuditLogHandler(req, res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("returns CSV when authorized", async () => {
    const { requireAdminToken } = await import("../utils/adminAuth");
    const { exportAuditLogCsv } = await import("../services/auditLogger");
    const { exportAuditLogHandler } = (await import(
      "./adminAuditLog"
    )) as ExportAuditLogHandlerModule;

    (requireAdminToken as any).mockReturnValue(true);
    (exportAuditLogCsv as any).mockResolvedValue(
      "event_type,actor,payload,timestamp\nAPI_KEY_REVOKE,admin-token,{},2026-03-29T12:34:56Z",
    );

    const { req, res, setHeader, send } = makeReqRes();
    await exportAuditLogHandler(req, res);

    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/csv");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      "attachment; filename=fluid_audit_log.csv",
    );
    expect(send).toHaveBeenCalledWith(expect.stringContaining("event_type,actor,payload,timestamp"));
  });
});
