import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../utils/db", () => ({
  default: {
    adminUser: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../services/auditLogger", () => ({
  logAuditEvent: vi.fn(),
  getAuditActor: vi.fn().mockReturnValue("test-actor"),
}));

import prisma from "../utils/db";
import { verifyAdminJwt } from "../utils/adminAuth";
import {
  adminLoginHandler,
  changeAdminPasswordHandler,
  createAdminUserHandler,
  deactivateAdminUserHandler,
  listAdminUsersHandler,
  updateAdminUserRoleHandler,
} from "./adminUsers";

const adminUser = (prisma as any).adminUser;

function makeReq(
  body: any = {},
  params: any = {},
  headers: Record<string, string> = {},
): Request {
  return {
    body,
    params,
    header: vi.fn((name: string) => headers[name.toLowerCase()]),
  } as unknown as Request;
}

function makeRes(): { res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  const res = { json, status } as unknown as Response;
  return { res, json, status };
}

describe("listAdminUsersHandler", () => {
  it("returns a list of users with sensitive fields omitted", async () => {
    adminUser.findMany.mockResolvedValueOnce([
      { id: "1", email: "a@test.com", role: "ADMIN", active: true, passwordHash: "SECRET", createdAt: new Date() },
    ]);
    const { res, json } = makeRes();
    await listAdminUsersHandler(makeReq(), res);
    expect(json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ email: "a@test.com", role: "ADMIN" }),
      ]),
    );
    const result = json.mock.calls[0][0];
    expect(result[0]).not.toHaveProperty("passwordHash");
  });

  it("returns 500 on db error", async () => {
    adminUser.findMany.mockRejectedValueOnce(new Error("db error"));
    const { res, status } = makeRes();
    await listAdminUsersHandler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(500);
  });
});

describe("createAdminUserHandler", () => {
  beforeEach(() => {
    adminUser.findUnique.mockResolvedValue(null);
    adminUser.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      createdAt: new Date(),
    }));
  });

  it("creates a user and returns 201", async () => {
    const { res, status } = makeRes();
    await createAdminUserHandler(
      makeReq({ email: "new@test.com", password: "secure123!987", role: "ADMIN" }),
      res,
    );
    expect(status).toHaveBeenCalledWith(201);
    const created = status.mock.results[0].value.json.mock.calls[0][0];
    expect(created.email).toBe("new@test.com");
    expect(created.role).toBe("ADMIN");
    expect(created).not.toHaveProperty("passwordHash");
  });

  it("rejects invalid role with 400", async () => {
    const { res, status } = makeRes();
    await createAdminUserHandler(
      makeReq({ email: "x@test.com", password: "pass", role: "GOD_MODE" }),
      res,
    );
    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns 409 when email already exists", async () => {
    adminUser.findUnique.mockResolvedValueOnce({ id: "1" });
    const { res, status } = makeRes();
    await createAdminUserHandler(
      makeReq({ email: "exists@test.com", password: "pass", role: "ADMIN" }),
      res,
    );
    expect(status).toHaveBeenCalledWith(409);
  });

  it("returns 400 when required fields are missing", async () => {
    const { res, status } = makeRes();
    await createAdminUserHandler(makeReq({ email: "only@test.com" }), res);
    expect(status).toHaveBeenCalledWith(400);
  });
});

describe("updateAdminUserRoleHandler", () => {
  it("updates role and returns updated user", async () => {
    adminUser.findUnique.mockResolvedValueOnce({ id: "1", email: "u@test.com", role: "READ_ONLY" });
    adminUser.update.mockResolvedValueOnce({ id: "1", email: "u@test.com", role: "ADMIN", active: true });

    const { res, json } = makeRes();
    await updateAdminUserRoleHandler(makeReq({ role: "ADMIN" }, { id: "1" }), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ role: "ADMIN" }));
  });

  it("returns 404 when user does not exist", async () => {
    adminUser.findUnique.mockResolvedValueOnce(null);
    const { res, status } = makeRes();
    await updateAdminUserRoleHandler(makeReq({ role: "ADMIN" }, { id: "ghost" }), res);
    expect(status).toHaveBeenCalledWith(404);
  });

  it("returns 400 for invalid role", async () => {
    const { res, status } = makeRes();
    await updateAdminUserRoleHandler(makeReq({ role: "INVALID" }, { id: "1" }), res);
    expect(status).toHaveBeenCalledWith(400);
  });
});

describe("deactivateAdminUserHandler", () => {
  it("sets active=false and bumps sessionVersion", async () => {
    adminUser.findUnique.mockResolvedValueOnce({
      id: "1",
      email: "u@test.com",
      active: true,
      sessionVersion: 2,
    });
    adminUser.update.mockResolvedValueOnce({ id: "1", email: "u@test.com", active: false, sessionVersion: 3 });

    const { res, json } = makeRes();
    await deactivateAdminUserHandler(makeReq({}, { id: "1" }), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionVersion: 3 }),
      }),
    );
  });

  it("returns 404 when user does not exist", async () => {
    adminUser.findUnique.mockResolvedValueOnce(null);
    const { res, status } = makeRes();
    await deactivateAdminUserHandler(makeReq({}, { id: "ghost" }), res);
    expect(status).toHaveBeenCalledWith(404);
  });
});

describe("adminLoginHandler", () => {
  beforeEach(() => {
    vi.stubEnv("FLUID_ADMIN_JWT_SECRET", "test-secret");
  });

  it("returns 400 when email or password missing", async () => {
    const { res, status } = makeRes();
    await adminLoginHandler(makeReq({ email: "x@test.com" }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns a jwt carrying the current sessionVersion for valid db users", async () => {
    const passwordHash = await bcrypt.hash("pw", 4);
    adminUser.findUnique.mockResolvedValueOnce({
      id: "1",
      email: "u@test.com",
      passwordHash,
      active: true,
      role: "ADMIN",
      sessionVersion: 6,
    });

    const { res, json } = makeRes();
    await adminLoginHandler(makeReq({ email: "u@test.com", password: "pw" }), res);

    const payload = json.mock.calls[0][0];
    expect(payload.email).toBe("u@test.com");
    expect(verifyAdminJwt(payload.token)?.sessionVersion).toBe(6);
  });

  it("returns 401 for unknown email", async () => {
    adminUser.findUnique.mockResolvedValueOnce(null);
    const { res, status } = makeRes();
    await adminLoginHandler(makeReq({ email: "unknown@test.com", password: "pw" }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("returns 401 for inactive user", async () => {
    adminUser.findUnique.mockResolvedValueOnce({ id: "1", email: "u@test.com", passwordHash: "$x", active: false });
    const { res, status } = makeRes();
    await adminLoginHandler(makeReq({ email: "u@test.com", password: "pw" }), res);
    expect(status).toHaveBeenCalledWith(401);
  });
});

describe("changeAdminPasswordHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FLUID_ADMIN_JWT_SECRET", "test-secret");
  });

  it("rejects missing fields", async () => {
    const { res, status } = makeRes();
    await changeAdminPasswordHandler(makeReq({ currentPassword: "old" }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("rejects short new passwords", async () => {
    const req = makeReq(
      { currentPassword: "old-password", newPassword: "short" },
      {},
      {},
    ) as Request & { adminAuth?: any };
    req.adminAuth = {
      authType: "jwt",
      userId: "1",
      email: "u@test.com",
      role: "ADMIN",
      sessionVersion: 0,
    };
    const { res, status } = makeRes();
    await changeAdminPasswordHandler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("rotates the token and increments sessionVersion after password change", async () => {
    const oldHash = await bcrypt.hash("old-password-123", 4);
    const req = makeReq(
      { currentPassword: "old-password-123", newPassword: "new-password-456" },
    ) as Request & { adminAuth?: any };
    req.adminAuth = {
      authType: "jwt",
      userId: "1",
      email: "u@test.com",
      role: "ADMIN",
      sessionVersion: 2,
    };

    adminUser.findUnique.mockResolvedValueOnce({
      id: "1",
      email: "u@test.com",
      role: "ADMIN",
      active: true,
      sessionVersion: 2,
      passwordHash: oldHash,
    });
    adminUser.update.mockImplementationOnce(async ({ data }: any) => ({
      id: "1",
      email: "u@test.com",
      role: "ADMIN",
      sessionVersion: data.sessionVersion,
      passwordHash: data.passwordHash,
      active: true,
    }));

    const { res, json } = makeRes();
    await changeAdminPasswordHandler(req, res);

    const payload = json.mock.calls[0][0];
    expect(verifyAdminJwt(payload.token)?.sessionVersion).toBe(3);
    expect(adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionVersion: 3,
          passwordChangedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects stale authenticated sessions", async () => {
    const hash = await bcrypt.hash("old-password-123", 4);
    const req = makeReq(
      { currentPassword: "old-password-123", newPassword: "new-password-456" },
    ) as Request & { adminAuth?: any };
    req.adminAuth = {
      authType: "jwt",
      userId: "1",
      email: "u@test.com",
      role: "ADMIN",
      sessionVersion: 1,
    };

    adminUser.findUnique.mockResolvedValueOnce({
      id: "1",
      email: "u@test.com",
      role: "ADMIN",
      active: true,
      sessionVersion: 2,
      passwordHash: hash,
    });

    const { res, status } = makeRes();
    await changeAdminPasswordHandler(req, res);
    expect(status).toHaveBeenCalledWith(401);
    expect(adminUser.update).not.toHaveBeenCalled();
  });

  it("rejects reusing the same password", async () => {
    const hash = await bcrypt.hash("old-password-123", 4);
    const req = makeReq(
      { currentPassword: "old-password-123", newPassword: "old-password-123" },
    ) as Request & { adminAuth?: any };
    req.adminAuth = {
      authType: "jwt",
      userId: "1",
      email: "u@test.com",
      role: "ADMIN",
      sessionVersion: 0,
    };

    adminUser.findUnique.mockResolvedValueOnce({
      id: "1",
      email: "u@test.com",
      role: "ADMIN",
      active: true,
      sessionVersion: 0,
      passwordHash: hash,
    });

    const { res, status } = makeRes();
    await changeAdminPasswordHandler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(adminUser.update).not.toHaveBeenCalled();
  });
});
