import { describe, it, expect, vi, beforeEach } from "vitest";
import { cspMiddleware } from "./csp";

describe("cspMiddleware", () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = { path: "/api/v1/fee-bump" };
    res = {
      headers: {} as Record<string, string>,
      locals: {} as Record<string, any>,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
    };
    next = vi.fn();
  });

  it("should generate a secure random nonce and attach it to res.locals", () => {
    const middleware = cspMiddleware();
    middleware(req, res, next);

    expect(res.locals.nonce).toBeDefined();
    expect(typeof res.locals.nonce).toBe("string");
    expect(res.locals.nonce.length).toBeGreaterThan(10);
    expect(next).toHaveBeenCalledWith();
  });

  it("should set strict Content-Security-Policy headers containing the nonce for standard routes", () => {
    const middleware = cspMiddleware();
    middleware(req, res, next);

    const csp = res.headers["Content-Security-Policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' 'nonce-${res.locals.nonce}' 'strict-dynamic'`);
    expect(csp).toContain(`style-src 'self' 'unsafe-inline' 'nonce-${res.locals.nonce}'`);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("should generate different nonces for consecutive requests", () => {
    const middleware = cspMiddleware();
    
    middleware(req, res, next);
    const nonce1 = res.locals.nonce;

    const res2 = {
      headers: {} as Record<string, string>,
      locals: {} as Record<string, any>,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
    };
    middleware(req, res2, next);
    const nonce2 = res2.locals.nonce;

    expect(nonce1).not.toBe(nonce2);
  });

  it("should apply a relaxed policy for Swagger /docs routes to prevent breakage", () => {
    const middleware = cspMiddleware();
    req.path = "/docs";
    middleware(req, res, next);

    const csp = res.headers["Content-Security-Policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("nonce-");
  });

  it("should apply a relaxed policy for Swagger docs.json route", () => {
    const middleware = cspMiddleware();
    req.path = "/docs.json";
    middleware(req, res, next);

    const csp = res.headers["Content-Security-Policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it("should apply a relaxed policy for Bull Board routes (/admin/queues)", () => {
    const middleware = cspMiddleware();
    req.path = "/admin/queues/jobs";
    middleware(req, res, next);

    const csp = res.headers["Content-Security-Policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("nonce-");
  });

  it("should set Content-Security-Policy-Report-Only header when reportOnly option is true", () => {
    const middleware = cspMiddleware({ reportOnly: true });
    middleware(req, res, next);

    expect(res.headers["Content-Security-Policy"]).toBeUndefined();
    expect(res.headers["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(res.headers["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
  });
});
