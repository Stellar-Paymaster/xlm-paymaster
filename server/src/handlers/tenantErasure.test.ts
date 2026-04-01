import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/tenantErasure", () => ({
  requestTenantErasure: vi.fn(),
}));

vi.mock("../utils/adminAuth", () => ({
  requireAdminToken: vi.fn(),
}));

vi.mock("../services/auditLogger", () => ({
  getAuditActor: vi.fn(),
}));

import { getAuditActor } from "../services/auditLogger";
import { requestTenantErasure } from "../services/tenantErasure";
import { requireAdminToken } from "../utils/adminAuth";
import {
  deleteCurrentTenantHandler,
  deleteTenantByAdminHandler,
} from "./tenantErasure";

function makeRes() {
  return {
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe("tenantErasure handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the current tenant using API-key context", async () => {
    (requestTenantErasure as any).mockResolvedValue({
      tenantId: "tenant-123",
      deletedAt: "2026-03-29T18:45:00.000Z",
      scheduledPurgeAt: "2026-04-28T18:45:00.000Z",
      confirmationEmailSent: true,
      alreadyScheduled: false,
    });

    const req = {} as any;
    const res = makeRes();
    res.locals.apiKey = { tenantId: "tenant-123" };
    const next = vi.fn();

    await deleteCurrentTenantHandler(req, res, next);

    expect(requestTenantErasure).toHaveBeenCalledWith({
      tenantId: "tenant-123",
      actor: "tenant-self-service",
    });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-123",
        confirmationEmailSent: true,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("requires admin auth for the admin deletion endpoint", async () => {
    (requireAdminToken as any).mockReturnValue(false);

    const req = { params: { tenantId: "tenant-123" } } as any;
    const res = makeRes();

    await deleteTenantByAdminHandler(req, res, vi.fn());

    expect(requestTenantErasure).not.toHaveBeenCalled();
  });

  it("deletes a tenant through the admin endpoint when authorized", async () => {
    (requireAdminToken as any).mockReturnValue(true);
    (getAuditActor as any).mockReturnValue("admin:ryan");
    (requestTenantErasure as any).mockResolvedValue({
      tenantId: "tenant-123",
      deletedAt: "2026-03-29T18:45:00.000Z",
      scheduledPurgeAt: "2026-04-28T18:45:00.000Z",
      confirmationEmailSent: false,
      alreadyScheduled: true,
    });

    const req = { params: { tenantId: "tenant-123" } } as any;
    const res = makeRes();
    const next = vi.fn();

    await deleteTenantByAdminHandler(req, res, next);

    expect(requestTenantErasure).toHaveBeenCalledWith({
      tenantId: "tenant-123",
      actor: "admin:ryan",
    });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(next).not.toHaveBeenCalled();
  });
});
