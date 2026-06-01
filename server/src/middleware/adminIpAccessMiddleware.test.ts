import { describe, it, expect, vi } from "vitest";
import { createAdminIpAccessMiddleware } from "./adminIpAccessMiddleware";
import { IpAccessControlService } from "../services/ipAccessControl";
import { Request, Response, NextFunction } from "express";

describe("adminIpAccessMiddleware", () => {
  it("should return 403 if IP is not allowed", () => {
    const service = new IpAccessControlService(["192.168.1.100"]);
    const middleware = createAdminIpAccessMiddleware(service);

    const req = { ip: "10.0.0.1" } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Forbidden" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() if IP is allowed", () => {
    const service = new IpAccessControlService(["10.0.0.0/8"]);
    const middleware = createAdminIpAccessMiddleware(service);

    const req = { ip: "10.5.5.5" } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});