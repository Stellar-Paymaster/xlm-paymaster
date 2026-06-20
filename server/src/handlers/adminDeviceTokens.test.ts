import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  listDeviceTokensHandler,
  registerDeviceTokenHandler,
  deleteDeviceTokenHandler,
} from "./adminDeviceTokens";

// Mock prisma
vi.mock("../utils/db", () => {
  const findMany = vi.fn();
  const create = vi.fn();
  const deleteOne = vi.fn();
  const findUnique = vi.fn();

  return {
    default: {
      deviceToken: { findMany, create, delete: deleteOne, findUnique },
    },
  };
});

function makeReqRes(overrides: {
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
}): { req: Request; res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ json, send });

  const req = {
    header: (name: string) => overrides.headers?.[name.toLowerCase()] ?? overrides.headers?.[name],
    body: overrides.body ?? {},
    params: overrides.params ?? {},
  } as unknown as Request;

  const res = {
    json,
    send,
    status,
  } as unknown as Response;

  return { req, res, json, status, send };
}

const ADMIN_TOKEN = "test-admin-token";

beforeEach(() => {
  vi.stubEnv("PAYMASTER_ADMIN_TOKEN", ADMIN_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function getPrismaDeviceToken() {
  const db = await import("../utils/db");
  return (db.default as any).deviceToken;
}

describe("listDeviceTokensHandler", () => {
  it("returns 401 when admin token is missing", async () => {
    const { req, res, status } = makeReqRes({ headers: {} });
    await listDeviceTokensHandler(req, res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("returns 401 when admin token is wrong", async () => {
    const { req, res, status } = makeReqRes({ headers: { "x-admin-token": "wrong" } });
    await listDeviceTokensHandler(req, res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("returns masked tokens list", async () => {
    const model = await getPrismaDeviceToken();
    model.findMany.mockResolvedValue([
      {
        id: "id-1",
        token: "a".repeat(32) + "ABCDEFGH",
        label: "My Phone",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const { req, res, json } = makeReqRes({ headers: { "x-admin-token": ADMIN_TOKEN } });
    await listDeviceTokensHandler(req, res);

    expect(json).toHaveBeenCalledWith({
      tokens: [
        expect.objectContaining({
          id: "id-1",
          token: "***ABCDEFGH",
          label: "My Phone",
        }),
      ],
    });
  });
});

describe("registerDeviceTokenHandler", () => {
  it("returns 400 when token is missing", async () => {
    const { req, res, status } = makeReqRes({
      headers: { "x-admin-token": ADMIN_TOKEN },
      body: {},
    });
    await registerDeviceTokenHandler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when token is too short", async () => {
    const { req, res, status } = makeReqRes({
      headers: { "x-admin-token": ADMIN_TOKEN },
      body: { token: "short" },
    });
    await registerDeviceTokenHandler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("creates and returns the token on success", async () => {
    const model = await getPrismaDeviceToken();
    const fakeToken = "x".repeat(140);
    model.create.mockResolvedValue({
      id: "new-id",
      token: fakeToken,
      label: "Test device",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    const { req, res, status } = makeReqRes({
      headers: { "x-admin-token": ADMIN_TOKEN },
      body: { token: fakeToken, label: "Test device" },
    });
    await registerDeviceTokenHandler(req, res);

    expect(status).toHaveBeenCalledWith(201);
    const body = status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.id).toBe("new-id");
    expect(body.token).toMatch(/^\*\*\*/);
    expect(body.label).toBe("Test device");
  });

  it("returns 409 when token is already registered", async () => {
    const model = await getPrismaDeviceToken();
    model.create.mockRejectedValue({ code: "P2002" });

    const { req, res, status } = makeReqRes({
      headers: { "x-admin-token": ADMIN_TOKEN },
      body: { token: "x".repeat(140) },
    });
    await registerDeviceTokenHandler(req, res);

    expect(status).toHaveBeenCalledWith(409);
  });
});

describe("deleteDeviceTokenHandler", () => {
  it("returns 404 when token does not exist", async () => {
    const model = await getPrismaDeviceToken();
    model.findUnique.mockResolvedValue(null);

    const { req, res, status } = makeReqRes({
      headers: { "x-admin-token": ADMIN_TOKEN },
      params: { id: "non-existent-id" },
    });
    await deleteDeviceTokenHandler(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });

  it("returns 204 on successful deletion", async () => {
    const model = await getPrismaDeviceToken();
    model.findUnique.mockResolvedValue({ id: "existing-id" });
    model.delete.mockResolvedValue({ id: "existing-id" });

    const { req, res, send, status } = makeReqRes({
      headers: { "x-admin-token": ADMIN_TOKEN },
      params: { id: "existing-id" },
    });
    await deleteDeviceTokenHandler(req, res);

    expect(status).toHaveBeenCalledWith(204);
    expect(send).toHaveBeenCalled();
  });
});
