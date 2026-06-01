import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import type { ApiKeyConfig } from "./apiKeys";

/**
 * Extracts the tenantId from the resolved API key and stores it in
 * res.locals.tenantId. Must be placed after apiKeyMiddleware in the
 * middleware chain.
 *
 * All downstream handlers must scope database queries to this tenantId
 * to prevent cross-tenant data access.
 */
export function tenantIsolationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;

  if (!apiKeyConfig?.tenantId) {
    return next(
      new AppError(
        "Tenant context is required. Ensure apiKeyMiddleware runs first.",
        401,
        "AUTH_FAILED"
      )
    );
  }

  res.locals.tenantId = apiKeyConfig.tenantId;
  next();
}

/**
 * Retrieves the tenantId established by tenantIsolationMiddleware.
 * Throws with a 500 if called before the middleware has run, making
 * accidental mis-ordering a hard failure rather than a silent data leak.
 */
export function requireTenantId(res: Response): string {
  const tenantId = res.locals.tenantId as string | undefined;
  if (!tenantId) {
    throw new AppError(
      "Missing tenant context. tenantIsolationMiddleware must run first.",
      500,
      "INTERNAL_ERROR"
    );
  }
  return tenantId;
}
