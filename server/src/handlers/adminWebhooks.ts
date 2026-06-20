import { Request, Response } from "express";
import prisma from "../utils/db";
import { UpdateWebhookSchema } from "../schemas/tenantWebhook";
import {
  deserializeWebhookEventTypes,
  serializeWebhookEventTypes,
} from "../services/webhookEventTypes";

const tenantModel = (prisma as any).tenant as {
  findMany: (args: any) => Promise<any[]>;
  findUnique: (args: any) => Promise<any | null>;
  update: (args: any) => Promise<any>;
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

function toWebhookSettingsResponse(tenant: {
  id: string;
  name?: string | null;
  webhookUrl?: string | null;
  webhookEventTypes?: string | null;
  updatedAt?: Date | null;
}) {
  return {
    tenantId: tenant.id,
    tenantName: tenant.name ?? null,
    webhookUrl: tenant.webhookUrl ?? null,
    eventTypes: deserializeWebhookEventTypes(tenant.webhookEventTypes),
    updatedAt: tenant.updatedAt?.toISOString() ?? null,
  };
}

export async function listWebhookSettingsHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) {
    return;
  }

  try {
    const tenants = await tenantModel.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        webhookUrl: true,
        webhookEventTypes: true,
        updatedAt: true,
      },
    });

    res.json({
      tenants: tenants.map(toWebhookSettingsResponse),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to list webhook settings" });
  }
}

export async function updateWebhookSettingsHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { tenantId } = req.params;
  const result = UpdateWebhookSchema.safeParse(req.body);

  if (!tenantId) {
    res.status(400).json({ error: "Tenant ID is required" });
    return;
  }

  if (!result.success) {
    res.status(400).json({ error: result.error.format() });
    return;
  }

  try {
    const existingTenant = await tenantModel.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        webhookUrl: true,
        webhookEventTypes: true,
        updatedAt: true,
      },
    });

    if (!existingTenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const tenant = await tenantModel.update({
      where: { id: tenantId },
      data: {
        webhookUrl:
          result.data.webhookUrl === undefined
            ? existingTenant.webhookUrl
            : result.data.webhookUrl,
        webhookEventTypes:
          result.data.eventTypes === undefined
            ? existingTenant.webhookEventTypes
            : serializeWebhookEventTypes(result.data.eventTypes),
      },
      select: {
        id: true,
        name: true,
        webhookUrl: true,
        webhookEventTypes: true,
        updatedAt: true,
      },
    });

    res.status(200).json(toWebhookSettingsResponse(tenant));
  } catch (error) {
    res.status(500).json({ error: "Failed to update webhook settings" });
  }
}
