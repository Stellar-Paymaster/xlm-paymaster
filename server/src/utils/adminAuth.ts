import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getAuditActor, logAuditEvent } from "../services/auditLogger";
import prisma from "./db";
import {
  AdminRole,
  Permission,
  hasPermission,
  isValidRole,
} from "./permissions";

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
  sessionVersion?: number;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedAdminContext {
  authType: "jwt" | "static-token";
  userId: string;
  email: string;
  role: AdminRole;
  sessionVersion: number;
}

const adminUserModel = (prisma as any).adminUser as {
  findUnique: (args: any) => Promise<any | null>;
};

function getJwtSecrets(): string[] {
  const secretsEnv = process.env.FLUID_ADMIN_JWT_SECRETS;
  if (secretsEnv) {
    const parsed = secretsEnv.split(",").map(s => s.trim()).filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  
  return [process.env.FLUID_ADMIN_JWT_SECRET ?? "dev-admin-jwt-secret"];
}

export function signAdminJwt(payload: Omit<AdminJwtPayload, "iat" | "exp">): string {
  return jwt.sign(
    {
      ...payload,
      sessionVersion: payload.sessionVersion ?? 0,
    },
    getJwtSecrets()[0],
    { expiresIn: "8h" },
  );
}

export function verifyAdminJwt(token: string): AdminJwtPayload | null {
  const secrets = getJwtSecrets();

  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret) as AdminJwtPayload;
      if (!isValidRole(decoded.role)) {
        continue;
      }

      return {
        ...decoded,
        sessionVersion: decoded.sessionVersion ?? 0,
      };
    } catch {
      // Continue to the next secret if verification fails
      continue;
    }
  }

  return null;
}

export function isAdminTokenAuthority(req: Request): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.FLUID_ADMIN_TOKEN;
  return Boolean(expected) && token === expected;
}

export function requireAdminToken(req: Request, res: Response): boolean {
  if (!isAdminTokenAuthority(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  void logAuditEvent("ADMIN_LOGIN", getAuditActor(req), {
    path: req.path,
    method: req.method,
  });

  return true;
}

function attachAdminAuth(req: Request, context: AuthenticatedAdminContext): void {
  (req as Request & { adminAuth?: AuthenticatedAdminContext }).adminAuth = context;
}

export function getAuthenticatedAdmin(req: Request): AuthenticatedAdminContext | null {
  return (req as Request & { adminAuth?: AuthenticatedAdminContext }).adminAuth ?? null;
}

export async function resolveAdminRole(req: Request): Promise<AdminRole | null> {
  const context = await resolveAdminAuthContext(req);
  return context?.role ?? null;
}

export async function resolveAdminAuthContext(
  req: Request,
): Promise<AuthenticatedAdminContext | null> {
  const jwtHeader = req.header("x-admin-jwt");
  if (jwtHeader) {
    const payload = verifyAdminJwt(jwtHeader);
    if (!payload) {
      return null;
    }

    if (payload.sub === "env-admin") {
      return {
        authType: "jwt",
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        sessionVersion: payload.sessionVersion ?? 0,
      };
    }

    const user = await adminUserModel.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active || !isValidRole(user.role)) {
      return null;
    }

    const currentSessionVersion = user.sessionVersion ?? 0;
    if (currentSessionVersion !== (payload.sessionVersion ?? 0)) {
      return null;
    }

    return {
      authType: "jwt",
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: currentSessionVersion,
    };
  }

  if (isAdminTokenAuthority(req)) {
    return {
      authType: "static-token",
      userId: "static-admin",
      email: "static-admin",
      role: "SUPER_ADMIN",
      sessionVersion: 0,
    };
  }

  return null;
}

export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = await resolveAdminAuthContext(req);
    if (!context) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    attachAdminAuth(req, context);

    if (!hasPermission(context.role, permission)) {
      res.status(403).json({
        error: "Forbidden",
        detail: `Role '${context.role}' does not have permission '${permission}'`,
      });
      return;
    }

    void logAuditEvent("ADMIN_LOGIN", getAuditActor(req), {
      path: req.path,
      method: req.method,
      role: context.role,
      permission,
    });

    next();
  };
}

export function requireAuthenticatedAdmin() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = await resolveAdminAuthContext(req);
    if (!context) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    attachAdminAuth(req, context);
    next();
  };
}
