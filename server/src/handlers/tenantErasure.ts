import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { ApiKeyConfig } from "../middleware/apiKeys";
import { getAuditActor } from "../services/auditLogger";
import { requestTenantErasure } from "../services/tenantErasure";
import { requireAdminToken } from "../utils/adminAuth";

function toResponseBody(result: Awaited<ReturnType<typeof requestTenantErasure>>) {
  return {
    message: "Tenant erasure scheduled",
    tenantId: result.tenantId,
    deletedAt: result.deletedAt,
    scheduledPurgeAt: result.scheduledPurgeAt,
    confirmationEmailSent: result.confirmationEmailSent,
    alreadyScheduled: result.alreadyScheduled,
  };
}

export async function deleteCurrentTenantHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;

  if (!apiKeyConfig?.tenantId) {
    next(new AppError("Missing tenant context for deletion", 500, "INTERNAL_ERROR"));
    return;
  }

  try {
    const result = await requestTenantErasure({
      tenantId: apiKeyConfig.tenantId,
      actor: "tenant-self-service",
    });

    res.status(202).json(toResponseBody(result));
  } catch (error) {
    next(error);
  }
}

export async function deleteTenantByAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { tenantId } = req.params;
  if (!tenantId) {
    res.status(400).json({ error: "tenantId is required" });
    return;
  }

  try {
    const result = await requestTenantErasure({
      tenantId,
      actor: getAuditActor(req),
    });

    res.status(202).json(toResponseBody(result));
  } catch (error) {
    next(error);
  }
}
