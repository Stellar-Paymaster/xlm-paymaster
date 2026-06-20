import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";

const API_KEYS = new Map<any, any>([
  ["paymaster-free-demo-key", { tier: "free", maxRequests: 2, windowMs: 60000 }],
  ["paymaster-pro-demo-key", { tier: "pro", maxRequests: 5, windowMs: 60000 }],
]);

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.header("authorization");
  const xApiKey = req.header("x-api-key");
  let providedKey: string | undefined;

  if (xApiKey) {
    providedKey = xApiKey;
  } else if (authHeader?.startsWith("Bearer ")) {
    providedKey = authHeader.split(" ")[1];
  }

  if (!providedKey) {
    return next(new AppError("API key required", 401, "AUTH_FAILED"));
  }

  let apiKeyConfig = API_KEYS.get(providedKey);

  if (!apiKeyConfig) {
    const authorizedKeys = (process.env.PAYMASTER_AUTHORIZED_API_KEYS || "")
      .split(",")
      .map((k) => k.trim());

    if (authorizedKeys.includes(providedKey)) {
      apiKeyConfig = {
        key: providedKey,
        tenantId: `tenant_${providedKey.slice(0, 5)}`,
        tier: "pro", // Default to pro for env-based keys
        maxRequests: 100,
        windowMs: 60000,
      };
    }
  }

  if (!apiKeyConfig) {
    console.warn(`[AUTH] 403: Unauthorized key: ${providedKey}`);
    return next(new AppError("Invalid API key", 403, "AUTH_FAILED"));
  }

  res.locals.apiKey = apiKeyConfig;
  (req as any).tenantId = apiKeyConfig.tenantId;

  next();
}
