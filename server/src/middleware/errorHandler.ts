import { NextFunction, Request, Response } from "express";
import { createLogger, serializeError } from "../utils/logger";

import { AppError } from "../errors/AppError";
import type { SlackNotifierLike } from "../services/slackNotifier";

const logger = createLogger({ component: "error_handler" });

// 404 - Unknown route handler
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: "NOT_FOUND",
  });
}

function notify5xx(
  slackNotifier: SlackNotifierLike | undefined,
  req: Request,
  statusCode: number,
  err: Error,
): void {
  if (!slackNotifier || statusCode < 500) {
    return;
  }

  void slackNotifier.notifyServerError({
    errorMessage: err.message,
    method: req.method,
    path: req.path,
    requestId: req.header("x-request-id") || undefined,
    statusCode,
    timestamp: new Date(),
  });
}

export function createGlobalErrorHandler(slackNotifier?: SlackNotifierLike) {
  return function globalErrorHandler(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const isProd = process.env.NODE_ENV === "production";

    if ((err as any).status === 413 || (err as any).type === "entity.too.large") {
      res.status(413).json({
        error: "Payload too large",
        code: "PAYLOAD_TOO_LARGE",
      });
      return;
    }

    if (err instanceof AppError) {
      notify5xx(slackNotifier, req, err.statusCode, err);
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
      });
      return;
    }

    // Unhandled / unexpected errors
    logger.error(
      {
        ...serializeError(err),
        method: req.method,
        path: req.path,
      },
      "Unhandled request error",
    );

    notify5xx(slackNotifier, req, 500, err);

    res.status(500).json({
      error: isProd ? "An unexpected error occurred" : err.message,
      code: "INTERNAL_ERROR",
      ...(isProd ? {} : { stack: err.stack }),
    });
  };
}

export const globalErrorHandler = createGlobalErrorHandler();
