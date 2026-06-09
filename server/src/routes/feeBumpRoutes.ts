import { Router, Request, Response, NextFunction } from "express";
import { feeBumpBatchHandler, feeBumpHandler } from "../handlers/feeBump";
import { apiKeyMiddleware } from "../middleware/apiKeys";
import { apiKeyRateLimit } from "../middleware/rateLimit";
import { tenantTierTxLimit } from "../middleware/txLimit";
import { sandboxRateLimit } from "../middleware/sandboxGuard";

export function createFeeBumpRouter(config: any, limiter: any) {
  const feeBumpRouter = Router();
  feeBumpRouter.post(
    "/",
    apiKeyMiddleware,
    sandboxRateLimit,
    apiKeyRateLimit,
    tenantTierTxLimit,
    limiter,
    (req: Request, res: Response, next: NextFunction) => {
      void feeBumpHandler(req, res, next, config);
    },
  );
  feeBumpRouter.post(
    "/batch",
    apiKeyMiddleware,
    sandboxRateLimit,
    apiKeyRateLimit,
    tenantTierTxLimit,
    limiter,
    (req: Request, res: Response, next: NextFunction) => {
      feeBumpBatchHandler(req, res, next, config);
    },
  );
  return feeBumpRouter;
}
