import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../utils/db";
import { getAuthenticatedAdmin, signAdminJwt } from "../utils/adminAuth";
import { AdminRole, isValidRole } from "../utils/permissions";
import { getAuditActor, logAuditEvent } from "../services/auditLogger";

const adminUserModel = (prisma as any).adminUser as {
  findMany: (args?: any) => Promise<any[]>;
  findUnique: (args: any) => Promise<any | null>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

function buildAdminAuthResponse(user: {
  id: string;
  email: string;
  role: AdminRole;
  sessionVersion?: number | null;
}) {
  const token = signAdminJwt({
    sub: user.id,
    email: user.email,
    role: user.role,
    sessionVersion: user.sessionVersion ?? 0,
  });

  return {
    token,
    role: user.role,
    email: user.email,
  };
}

function getDbBackedAuthenticatedUser(req: Request) {
  const auth = getAuthenticatedAdmin(req);
  if (!auth || auth.authType !== "jwt" || auth.userId === "env-admin") {
    return null;
  }

  return auth;
}

export async function adminLoginHandler(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const user = await adminUserModel.findUnique({ where: { email } });

    if (user && user.active) {
      const match = await bcrypt.compare(password, user.passwordHash);
      if (match) {
        void logAuditEvent("ADMIN_LOGIN", user.email, { source: "db" });
        return res.json(buildAdminAuthResponse(user));
      }
    }

    const envEmail = process.env.ADMIN_EMAIL;
    const envHash = process.env.ADMIN_PASSWORD_HASH;
    if (envEmail && envHash && email === envEmail) {
      const match = await bcrypt.compare(password, envHash);
      if (match) {
        const token = signAdminJwt({
          sub: "env-admin",
          email: envEmail,
          role: "SUPER_ADMIN",
          sessionVersion: 0,
        });
        void logAuditEvent("ADMIN_LOGIN", envEmail, { source: "env" });
        return res.json({ token, role: "SUPER_ADMIN", email: envEmail });
      }
    }

    return res.status(401).json({ error: "Invalid credentials" });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function changeAdminPasswordHandler(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }

  if (typeof newPassword !== "string" || newPassword.length < 12) {
    return res.status(400).json({ error: "newPassword must be at least 12 characters long" });
  }

  const auth = getDbBackedAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await adminUserModel.findUnique({ where: { id: auth.userId } });
    if (!user || !user.active) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionVersion = user.sessionVersion ?? 0;
    if (sessionVersion !== auth.sessionVersion) {
      return res.status(401).json({ error: "Session is no longer valid. Please log in again." });
    }

    const currentPasswordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentPasswordMatches) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const reusesExistingPassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (reusesExistingPassword) {
      return res.status(400).json({ error: "newPassword must be different from the current password" });
    }

    const updated = await adminUserModel.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        sessionVersion: sessionVersion + 1,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    void logAuditEvent("ADMIN_LOGIN", getAuditActor(req), {
      action: "change_admin_password",
      targetId: updated.id,
      targetEmail: updated.email,
      invalidatedSessionVersion: sessionVersion,
      newSessionVersion: updated.sessionVersion ?? sessionVersion + 1,
    });

    return res.json(buildAdminAuthResponse(updated));
  } catch {
    return res.status(500).json({ error: "Failed to change password" });
  }
}

export async function listAdminUsersHandler(req: Request, res: Response) {
  try {
    const users = await adminUserModel.findMany({
      orderBy: { createdAt: "desc" },
    });
    return res.json(
      users.map((u: any) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt,
      })),
    );
  } catch {
    return res.status(500).json({ error: "Failed to list admin users" });
  }
}

export async function createAdminUserHandler(req: Request, res: Response) {
  const { email, password, role } = req.body ?? {};

  if (!email || !password || !role) {
    return res.status(400).json({ error: "email, password, and role are required" });
  }
  if (!isValidRole(role)) {
    return res.status(400).json({ error: "Invalid role. Must be one of: SUPER_ADMIN, ADMIN, READ_ONLY, BILLING" });
  }

  try {
    const existing = await adminUserModel.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An admin user with that email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await adminUserModel.create({
      data: {
        id: require("crypto").randomUUID(),
        email,
        passwordHash,
        role,
        active: true,
        sessionVersion: 0,
      },
    });

    void logAuditEvent("ADMIN_LOGIN", getAuditActor(req), {
      action: "create_admin_user",
      targetEmail: email,
      role,
    });

    return res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
    });
  } catch {
    return res.status(500).json({ error: "Failed to create admin user" });
  }
}

export async function updateAdminUserRoleHandler(req: Request, res: Response) {
  const { id } = req.params;
  const { role } = req.body ?? {};

  if (!role || !isValidRole(role)) {
    return res.status(400).json({ error: "Invalid role. Must be one of: SUPER_ADMIN, ADMIN, READ_ONLY, BILLING" });
  }

  try {
    const user = await adminUserModel.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "Admin user not found" });
    }

    const updated = await adminUserModel.update({
      where: { id },
      data: { role, updatedAt: new Date() },
    });

    void logAuditEvent("ADMIN_LOGIN", getAuditActor(req), {
      action: "update_admin_role",
      targetId: id,
      targetEmail: updated.email,
      newRole: role,
      previousRole: user.role,
    });

    return res.json({
      id: updated.id,
      email: updated.email,
      role: updated.role,
      active: updated.active,
    });
  } catch {
    return res.status(500).json({ error: "Failed to update role" });
  }
}

export async function deactivateAdminUserHandler(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const user = await adminUserModel.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "Admin user not found" });
    }

    const updated = await adminUserModel.update({
      where: { id },
      data: {
        active: false,
        sessionVersion: (user.sessionVersion ?? 0) + 1,
        updatedAt: new Date(),
      },
    });

    void logAuditEvent("ADMIN_LOGIN", getAuditActor(req), {
      action: "deactivate_admin_user",
      targetId: id,
      targetEmail: updated.email,
    });

    return res.json({ id: updated.id, email: updated.email, active: false });
  } catch {
    return res.status(500).json({ error: "Failed to deactivate admin user" });
  }
}
