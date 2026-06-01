import { NextFunction, Request, Response } from "express";
import { createLogger, logger } from "../utils/logger";
import { getAuditActor } from "../services/auditLogger";

declare global {
  namespace Express {
    interface Request {
      logger: ReturnType<typeof createLogger>;
    }
  }
}

export function getIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

export function getResource(req: Request): string {
  return `${req.method} ${req.originalUrl || req.url}`;
}

export function soc2RequestLogger(req: Request, res: Response, next: NextFunction): void {
  const actor = getAuditActor(req);
  const ip = getIp(req);
  const resource = getResource(req);

  const reqLogger = createLogger({ actor, ip, resource, component: "http" });
  req.logger = reqLogger;

  reqLogger.info({ outcome: "in_progress", status: "received" }, "request_received");

  res.on("finish", () => {
    const outcome = res.statusCode >= 400 ? "failure" : "success";
    reqLogger.info({ status: res.statusCode, outcome }, "request_completed");
  });

  res.on("error", (err: Error) => {
    reqLogger.error({ err, outcome: "failure", status: 500 }, "request_error");
  });

  next();
}

export function attachLoggerToReq(req: Request, res: Response, next: NextFunction): void {
  req.logger = createLogger({ actor: getAuditActor(req), ip: getIp(req), resource: getResource(req) });
  next();
}