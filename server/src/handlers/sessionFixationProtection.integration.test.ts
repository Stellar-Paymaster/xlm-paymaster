import bcrypt from "bcryptjs";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/db", () => ({
  default: {
    adminUser: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../services/auditLogger", () => ({
  logAuditEvent: vi.fn(),
  getAuditActor: vi.fn().mockReturnValue("test-actor"),
}));

import prisma from "../utils/db";
import { changeAdminPasswordHandler } from "./adminUsers";
import { requireAuthenticatedAdmin, requirePermission, signAdminJwt } from "../utils/adminAuth";

const adminUser = (prisma as any).adminUser;

describe("session fixation protection integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("FLUID_ADMIN_JWT_SECRET", "test-secret");
  });

  it("invalidates the old token after password change and accepts the refreshed token", async () => {
    const state = {
      id: "admin-1",
      email: "admin@test.com",
      role: "ADMIN",
      active: true,
      sessionVersion: 2,
      passwordHash: await bcrypt.hash("old-password-123", 4),
    };

    adminUser.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === state.id) {
        return { ...state };
      }
      return null;
    });

    adminUser.update.mockImplementation(async ({ where, data }: any) => {
      if (where.id !== state.id) {
        throw new Error("unexpected admin user");
      }

      state.passwordHash = data.passwordHash;
      state.sessionVersion = data.sessionVersion;
      return { ...state, passwordChangedAt: data.passwordChangedAt };
    });

    const app = express();
    app.use(express.json());
    app.get("/protected", requirePermission("manage_api_keys"), (_req, res) => {
      res.json({ ok: true });
    });
    app.post("/change-password", requireAuthenticatedAdmin(), (req, res) => {
      void changeAdminPasswordHandler(req, res);
    });

    const originalToken = signAdminJwt({
      sub: state.id,
      email: state.email,
      role: "ADMIN",
      sessionVersion: state.sessionVersion,
    });

    await request(app)
      .get("/protected")
      .set("x-admin-jwt", originalToken)
      .expect(200, { ok: true });

    const passwordChangeResponse = await request(app)
      .post("/change-password")
      .set("x-admin-jwt", originalToken)
      .send({
        currentPassword: "old-password-123",
        newPassword: "new-password-456",
      })
      .expect(200);

    expect(state.sessionVersion).toBe(3);

    await request(app)
      .get("/protected")
      .set("x-admin-jwt", originalToken)
      .expect(401, { error: "Unauthorized" });

    await request(app)
      .get("/protected")
      .set("x-admin-jwt", passwordChangeResponse.body.token)
      .expect(200, { ok: true });
  });
});
