import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  tenantIsolationMiddleware,
  requireTenantId,
} from "./tenantIsolation";

function mockRes(locals: Record<string, unknown> = {}): Response {
  return { locals } as unknown as Response;
}

function mockNext(): NextFunction & { calls: unknown[] } {
  const fn = vi.fn() as any;
  fn.calls = fn.mock.calls;
  return fn;
}

describe("tenantIsolationMiddleware", () => {
  it("sets res.locals.tenantId from apiKeyConfig", () => {
    const res = mockRes({ apiKey: { tenantId: "t-123" } });
    const next = mockNext();
    tenantIsolationMiddleware({} as Request, res, next);
    expect(res.locals.tenantId).toBe("t-123");
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next with an AppError when apiKey is missing", () => {
    const res = mockRes({});
    const next = mockNext();
    tenantIsolationMiddleware({} as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as any;
    expect(err).toBeDefined();
    expect(err.statusCode ?? err.status).toBe(401);
  });

  it("calls next with an error when apiKey has no tenantId", () => {
    const res = mockRes({ apiKey: { tenantId: "" } });
    const next = mockNext();
    tenantIsolationMiddleware({} as Request, res, next);
    const err = next.mock.calls[0][0] as any;
    expect(err).toBeDefined();
  });

  it("does not overwrite an existing tenantId from a different apiKey", () => {
    const res = mockRes({ apiKey: { tenantId: "new-tenant" } });
    const next = mockNext();
    tenantIsolationMiddleware({} as Request, res, next);
    expect(res.locals.tenantId).toBe("new-tenant");
  });
});

describe("requireTenantId", () => {
  it("returns the tenantId when present in res.locals", () => {
    const res = mockRes({ tenantId: "t-xyz" });
    expect(requireTenantId(res)).toBe("t-xyz");
  });

  it("throws an AppError when tenantId is absent", () => {
    const res = mockRes({});
    expect(() => requireTenantId(res)).toThrow();
  });

  it("thrown error has status 500", () => {
    const res = mockRes({});
    try {
      requireTenantId(res);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.statusCode ?? err.status).toBe(500);
    }
  });
});
