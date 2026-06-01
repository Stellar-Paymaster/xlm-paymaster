import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { registerHandler } from "./registration";
import { createRegistration } from "../services/registrationService";

vi.mock("../services/registrationService", () => ({
  createRegistration: vi.fn(),
  verifyRegistration: vi.fn(),
}));

function makeReqRes(overrides: {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  ip?: string;
}): {
  req: Request;
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  next: NextFunction;
} {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();

  const req = {
    body: overrides.body ?? {},
    ip: overrides.ip ?? "::1",
    header: (name: string) =>
      overrides.headers?.[name.toLowerCase()] ?? overrides.headers?.[name],
  } as unknown as Request;

  const res = {
    status,
    json,
  } as unknown as Response;

  return {
    req,
    res,
    status,
    json,
    next: vi.fn(),
  };
}

describe("registerHandler", () => {
  const mockCreateRegistration = createRegistration as unknown as ReturnType<
    typeof vi.fn
  >;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validation errors when Terms of Service is not accepted", async () => {
    const { req, res, status, json, next } = makeReqRes({
      body: {
        email: "dev@example.com",
        projectName: "My App",
        intendedUse: "Sponsor Stellar transactions",
        acceptTos: false,
      },
    });

    await registerHandler(req, res, next);

    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Validation failed",
        details: expect.objectContaining({
          acceptTos: expect.any(Array),
        }),
      }),
    );
  });

  it("passes accepted ToS payload with resolved client IP", async () => {
    mockCreateRegistration.mockResolvedValue(undefined);

    const { req, res, status, json, next } = makeReqRes({
      body: {
        email: "dev@example.com",
        projectName: "My App",
        intendedUse: "Sponsor Stellar transactions",
        acceptTos: true,
      },
      headers: {
        "x-forwarded-for": "203.0.113.7, 10.0.0.9",
      },
      ip: "::1",
    });

    await registerHandler(req, res, next);

    expect(mockCreateRegistration).toHaveBeenCalledWith({
      email: "dev@example.com",
      projectName: "My App",
      intendedUse: "Sponsor Stellar transactions",
      acceptTos: true,
      tosAcceptedIp: "203.0.113.7",
    });
    expect(status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Registration received"),
      }),
    );
  });
});
