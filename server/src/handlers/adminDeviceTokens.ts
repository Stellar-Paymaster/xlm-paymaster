import { Request, Response } from "express";
import prisma from "../utils/db";

const deviceTokenModel = (prisma as any).deviceToken as {
  findMany: (args: any) => Promise<Array<{ id: string; token: string; label: string | null; createdAt: Date }>>;
  create: (args: any) => Promise<{ id: string; token: string; label: string | null; createdAt: Date }>;
  delete: (args: any) => Promise<{ id: string }>;
  findUnique: (args: any) => Promise<{ id: string } | null>;
};

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.PAYMASTER_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export async function listDeviceTokensHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) {
    return;
  }

  try {
    const tokens = await deviceTokenModel.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, label: true, createdAt: true },
    });

    res.json({
      tokens: tokens.map((t) => ({
        id: t.id,
        token: maskToken(t.token),
        label: t.label,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to list device tokens" });
  }
}

export async function registerDeviceTokenHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { token, label } = req.body ?? {};

  if (typeof token !== "string" || token.trim().length === 0) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  const trimmedToken = token.trim();

  // Basic FCM token validation: typically 140-200+ chars, alphanumeric + hyphens/underscores/colons
  if (trimmedToken.length < 32) {
    res.status(400).json({ error: "token appears invalid (too short)" });
    return;
  }

  try {
    const created = await deviceTokenModel.create({
      data: {
        token: trimmedToken,
        label: typeof label === "string" ? label.trim() || null : null,
      },
      select: { id: true, token: true, label: true, createdAt: true },
    });

    res.status(201).json({
      id: created.id,
      token: maskToken(created.token),
      label: created.label,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (error: any) {
    // Prisma unique constraint violation
    if (error?.code === "P2002") {
      res.status(409).json({ error: "Device token already registered" });
      return;
    }
    res.status(500).json({ error: "Failed to register device token" });
  }
}

export async function deleteDeviceTokenHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { id } = req.params;

  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  try {
    const existing = await deviceTokenModel.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Device token not found" });
      return;
    }

    await deviceTokenModel.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete device token" });
  }
}

/** Show only the last 8 characters of the token for security */
function maskToken(token: string): string {
  if (token.length <= 8) {
    return "***";
  }
  return `***${token.slice(-8)}`;
}
