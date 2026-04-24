import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("./db", () => ({
  default: {
    adminUser: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../services/auditLogger", () => ({
  logAuditEvent: vi.fn(),
  getAuditActor: vi.fn().mockReturnValue("test"),
}));

import prisma from "./db";
import {
  requireAuthenticatedAdmin,
  requirePermission,
  resolveAdminRole,
  signAdminJwt,
  verifyAdminJwt,
} from "./adminAuth";

const adminUser = (prisma as any).adminUser;

function makeReq(headers: Record<string, string> = {}): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

function makeRes() {
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { json, status } as unknown as Response, json, status };
}

describe("signAdminJwt / verifyAdminJwt", () => {
  beforeEach(() => {
    vi.stubEnv("FLUID_ADMIN_JWT_SECRET", "test-secret");
  });

  it("round-trips a token and preserves sessionVersion", () => {
    const payload = { sub: "u1", email: "a@test.com", role: "ADMIN" as const, sessionVersion: 7 };
    const token = signAdminJwt(payload);
    const decoded = verifyAdminJwt(token);
    expect(decoded?.sub).toBe("u1");
    expect(decoded?.role).toBe("ADMIN");
    expect(decoded?.sessionVersion).toBe(7);
  });

  it("defaults sessionVersion to zero for legacy callers", () => {
    const token = signAdminJwt({ sub: "u1", email: "a@test.com", role: "ADMIN" });
    expect(verifyAdminJwt(token)?.sessionVersion).toBe(0);
  });

  it("returns null for a tampered token", () => {
    const token = signAdminJwt({ sub: "u1", email: "a@test.com", role: "ADMIN" });
    expect(verifyAdminJwt(`${token}tampered`)).toBeNull();
  });

  it("returns null for an invalid token", () => {
    expect(verifyAdminJwt("not.a.jwt")).toBeNull();
  });
});

describe("resolveAdminRole", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("FLUID_ADMIN_TOKEN", "static-token");
    vi.stubEnv("FLUID_ADMIN_JWT_SECRET", "test-secret");
  });

  it("resolves the current DB role for a valid admin jwt", async () => {
    adminUser.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "a@test.com",
      role: "READ_ONLY",
      active: true,
      sessionVersion: 2,
    });

    const token = signAdminJwt({
      sub: "u1",
      email: "a@test.com",
      role: "ADMIN",
      sessionVersion: 2,
    });

    await expect(resolveAdminRole(makeReq({ "x-admin-jwt": token }))).resolves.toBe("READ_ONLY");
  });

  it("returns null when the sessionVersion is stale", async () => {
    adminUser.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "a@test.com",
      role: "ADMIN",
      active: true,
      sessionVersion: 3,
    });

    const token = signAdminJwt({
      sub: "u1",
      email: "a@test.com",
      role: "ADMIN",
      sessionVersion: 2,
    });

    await expect(resolveAdminRole(makeReq({ "x-admin-jwt": token }))).resolves.toBeNull();
  });

  it("falls back to SUPER_ADMIN when static token matches", async () => {
    await expect(resolveAdminRole(makeReq({ "x-admin-token": "static-token" }))).resolves.toBe("SUPER_ADMIN");
  });

  it("returns null when neither header is present", async () => {
    await expect(resolveAdminRole(makeReq({}))).resolves.toBeNull();
  });

  it("returns null for an invalid jwt even if static token matches", async () => {
    await expect(
      resolveAdminRole(makeReq({ "x-admin-jwt": "invalid.jwt.here", "x-admin-token": "static-token" })),
    ).resolves.toBeNull();
  });
});

describe("requirePermission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("FLUID_ADMIN_TOKEN", "static-token");
    vi.stubEnv("FLUID_ADMIN_JWT_SECRET", "test-secret");
  });

  it("calls next when the current DB role has the permission", async () => {
    adminUser.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "a@test.com",
      role: "ADMIN",
      active: true,
      sessionVersion: 4,
    });

    const token = signAdminJwt({
      sub: "u1",
      email: "a@test.com",
      role: "READ_ONLY",
      sessionVersion: 4,
    });
    const req = makeReq({ "x-admin-jwt": token });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    await requirePermission("manage_api_keys")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 401 when the jwt session has been invalidated", async () => {
    adminUser.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "a@test.com",
      role: "ADMIN",
      active: true,
      sessionVersion: 5,
    });

    const token = signAdminJwt({
      sub: "u1",
      email: "a@test.com",
      role: "ADMIN",
      sessionVersion: 4,
    });
    const req = makeReq({ "x-admin-jwt": token });
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;

    await requirePermission("manage_api_keys")(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when role lacks the permission", async () => {
    adminUser.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "a@test.com",
      role: "READ_ONLY",
      active: true,
      sessionVersion: 1,
    });

    const token = signAdminJwt({ sub: "u1", email: "a@test.com", role: "READ_ONLY", sessionVersion: 1 });
    const req = makeReq({ "x-admin-jwt": token });
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;

    await requirePermission("manage_api_keys")(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no auth header is provided", async () => {
    const req = makeReq({});
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;

    await requirePermission("view_transactions")(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows SUPER_ADMIN via static token", async () => {
    const req = makeReq({ "x-admin-token": "static-token" });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    await requirePermission("manage_users")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("requireAuthenticatedAdmin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("FLUID_ADMIN_JWT_SECRET", "test-secret");
  });

  it("attaches authenticated jwt admin context", async () => {
    adminUser.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "a@test.com",
      role: "ADMIN",
      active: true,
      sessionVersion: 1,
    });

    const token = signAdminJwt({ sub: "u1", email: "a@test.com", role: "ADMIN", sessionVersion: 1 });
    const req = makeReq({ "x-admin-jwt": token }) as Request & {
      adminAuth?: { userId: string; email: string };
    };
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    await requireAuthenticatedAdmin()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.adminAuth?.userId).toBe("u1");
    expect(req.adminAuth?.email).toBe("a@test.com");
  });
});
