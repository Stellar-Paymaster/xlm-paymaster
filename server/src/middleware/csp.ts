import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export interface CspOptions {
  reportOnly?: boolean;
}

/**
 * Strict Content Security Policy (CSP) middleware.
 * Generates a unique secure random nonce per request, adds it to response locals,
 * and sets the HTTP Content-Security-Policy header.
 * 
 * Supports relaxed policies for developer/admin entry points (Swagger Docs, Bull Board)
 * which rely on inline styles/scripts that are not compatible with strict nonce-only execution.
 */
export function cspMiddleware(options: CspOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate a secure random nonce for script and style execution
    const nonce = crypto.randomBytes(16).toString("base64");
    res.locals.nonce = nonce;

    // Check if the current request path is excluded from strict nonce checks
    // Swagger UI (/docs) and Bull Board (/admin/queues) require relaxed CSPs
    const isSwagger = req.path.startsWith("/docs") || req.path === "/docs.json";
    const isBullBoard = req.path.startsWith("/admin/queues");

    let policy: string;

    if (isSwagger || isBullBoard) {
      // Relaxed policy for tools that inject dynamic inline scripts/styles
      policy = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join("; ");
    } else {
      // Strict nonce-based policy for regular pages/dashboards
      policy = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        `style-src 'self' 'unsafe-inline' 'nonce-${nonce}'`,
        "img-src 'self' data: blob:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join("; ");
    }

    const headerName = options.reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

    res.setHeader(headerName, policy);
    next();
  };
}
