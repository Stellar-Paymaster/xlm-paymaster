import { Request, Response, NextFunction } from "express";
import CIDRMatcher from "cidr-matcher";
import { loadConfig } from "../config";
import { createLogger } from "../utils/logger";
import { AppError } from "../errors/AppError";

const logger = createLogger({ component: "ip_filter" });
const config = loadConfig();

const allowMatcher = config.ipAllowlist.length > 0 ? new CIDRMatcher(config.ipAllowlist) : null;
const denyMatcher = config.ipDenylist.length > 0 ? new CIDRMatcher(config.ipDenylist) : null;

/**
 * IP Filtering Middleware
 * 
 * Evaluates client IP against configured allowlist and denylist.
 * Respects X-Forwarded-For if TRUST_PROXY is enabled in Express.
 */
export function ipFilterMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip;

  if (!clientIp) {
    return next();
  }

  // 1. Check Denylist (Explicit blocks take precedence)
  if (denyMatcher && denyMatcher.contains(clientIp)) {
    logger.warn({ ip: clientIp, reason: "denylist" }, "Access denied: IP is in denylist");
    return next(new AppError("Access denied", 403, "IP_FORBIDDEN"));
  }

  // 2. Check Allowlist (If configured, IP must be present)
  if (allowMatcher && !allowMatcher.contains(clientIp)) {
    logger.warn({ ip: clientIp, reason: "not_in_allowlist" }, "Access denied: IP is not in allowlist");
    return next(new AppError("Access denied", 403, "IP_FORBIDDEN"));
  }

  next();
}