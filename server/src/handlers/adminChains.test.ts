import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response } from "express";
import request from "supertest";

// ── Mock Prisma ───────────────────────────────────────────────────────────────
vi.mock("../utils/db", () => ({
  default: {
    chainRegistry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// ── Mock RPC validation so we don't make real network calls ──────────────────
vi.mock("../services/chainRegistryService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chainRegistryService")>();
  return {
    ...actual,
    validateRpcUrl: vi.fn().mockResolvedValue(undefined),
  };
});

import prisma from "../utils/db";
import {
  listChainsHandler,
  createChainHandler,
  updateChainHandler,
  deleteChainHandler,
} from "./adminChains";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHAIN_1 = {
  id: "chain-1",
  chainId: "testnet",
  name: "Stellar Testnet",
  rpcUrl: "https://horizon-testnet.stellar.org",
  enabled: true,
  encryptedSecret: null,
  initializationVec: null,
  authTag: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const CHAIN_2 = {
  id: "chain-2",
  chainId: "mainnet",
  name: "Stellar Mainnet",
  rpcUrl: "https://horizon.stellar.org",
  enabled: false,
  encryptedSecret: null,
  initializationVec: null,
  authTag: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

// ── App factory ───────────────────────────────────────────────────────────────

const ADMIN_TOKEN = "test-admin-token";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get("/admin/chains", (req: Request, res: Response) => {
    void listChainsHandler(req, res);
  });
  app.post("/admin/chains", (req: Request, res: Response) => {
    void createChainHandler(req, res);
  });
  app.patch("/admin/chains/:id", (req: Request, res: Response) => {
    void updateChainHandler(req, res);
  });
  app.delete("/admin/chains/:id", (req: Request, res: Response) => {
    void deleteChainHandler(req, res);
  });
  return app;
}

function withAuth(req: request.Test) {
  return req.set("x-admin-token", ADMIN_TOKEN);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("adminChains handlers", () => {
  const db = prisma as any;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.PAYMASTER_ADMIN_TOKEN = ADMIN_TOKEN;
    process.env.PAYMASTER_SIGNER_ENCRYPTION_KEY = "test-encryption-key-32chars-long!!";
  });

  // ── Authorization ──────────────────────────────────────────────────────────

  describe("authorization", () => {
    it("returns 401 when token is missing", async () => {
      const app = buildApp();
      const res = await request(app).get("/admin/chains");
      expect(res.status).toBe(401);
    });

    it("returns 401 when token is wrong", async () => {
      const app = buildApp();
      const res = await request(app)
        .get("/admin/chains")
        .set("x-admin-token", "wrong-token");
      expect(res.status).toBe(401);
    });
  });

  // ── GET /admin/chains ──────────────────────────────────────────────────────

  describe("GET /admin/chains", () => {
    it("returns list of chains", async () => {
      db.chainRegistry.findMany.mockResolvedValue([CHAIN_1, CHAIN_2]);
      const app = buildApp();

      const res = await withAuth(request(app).get("/admin/chains"));

      expect(res.status).toBe(200);
      expect(res.body.chains).toHaveLength(2);
      expect(res.body.chains[0].chainId).toBe("testnet");
      expect(res.body.chains[0]).not.toHaveProperty("encryptedSecret");
      expect(res.body.chains[0].hasFeePayerSecret).toBe(false);
    });

    it("marks hasFeePayerSecret true when encrypted secret is present", async () => {
      db.chainRegistry.findMany.mockResolvedValue([
        { ...CHAIN_1, encryptedSecret: "enc", initializationVec: "iv", authTag: "tag" },
      ]);
      const app = buildApp();

      const res = await withAuth(request(app).get("/admin/chains"));

      expect(res.status).toBe(200);
      expect(res.body.chains[0].hasFeePayerSecret).toBe(true);
    });
  });

  // ── POST /admin/chains ─────────────────────────────────────────────────────

  describe("POST /admin/chains", () => {
    it("creates a chain and returns 201", async () => {
      db.chainRegistry.findUnique.mockResolvedValue(null);
      db.chainRegistry.create.mockResolvedValue({
        ...CHAIN_2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const app = buildApp();

      const res = await withAuth(
        request(app).post("/admin/chains").send({
          chainId: "mainnet",
          name: "Stellar Mainnet",
          rpcUrl: "https://horizon.stellar.org",
        }),
      );

      expect(res.status).toBe(201);
      expect(res.body.chain.chainId).toBe("mainnet");
    });

    it("returns 400 when chainId is missing", async () => {
      const app = buildApp();

      const res = await withAuth(
        request(app).post("/admin/chains").send({
          name: "Stellar Mainnet",
          rpcUrl: "https://horizon.stellar.org",
        }),
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/chainId/);
    });

    it("returns 400 when chainId already exists", async () => {
      db.chainRegistry.findUnique.mockResolvedValue(CHAIN_1);
      const app = buildApp();

      const res = await withAuth(
        request(app).post("/admin/chains").send({
          chainId: "testnet",
          name: "Duplicate",
          rpcUrl: "https://horizon-testnet.stellar.org",
        }),
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/);
    });
  });

  // ── PATCH /admin/chains/:id ────────────────────────────────────────────────

  describe("PATCH /admin/chains/:id", () => {
    it("updates a chain name", async () => {
      const updated = { ...CHAIN_1, name: "Renamed Testnet" };
      db.chainRegistry.findUnique.mockResolvedValue(CHAIN_1);
      db.chainRegistry.update.mockResolvedValue(updated);
      const app = buildApp();

      const res = await withAuth(
        request(app).patch("/admin/chains/chain-1").send({ name: "Renamed Testnet" }),
      );

      expect(res.status).toBe(200);
      expect(res.body.chain.name).toBe("Renamed Testnet");
    });

    it("validates RPC URL when enabling a chain", async () => {
      const { validateRpcUrl } = await import("../services/chainRegistryService");
      db.chainRegistry.findUnique.mockResolvedValue(CHAIN_2);
      db.chainRegistry.update.mockResolvedValue({ ...CHAIN_2, enabled: true });
      const app = buildApp();

      const res = await withAuth(
        request(app).patch("/admin/chains/chain-2").send({ enabled: true }),
      );

      expect(res.status).toBe(200);
      expect(validateRpcUrl).toHaveBeenCalledWith(CHAIN_2.rpcUrl);
    });

    it("returns 404 when chain not found", async () => {
      db.chainRegistry.findUnique.mockResolvedValue(null);
      const app = buildApp();

      const res = await withAuth(
        request(app).patch("/admin/chains/nonexistent").send({ name: "X" }),
      );

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /admin/chains/:id ───────────────────────────────────────────────

  describe("DELETE /admin/chains/:id", () => {
    it("deletes a chain", async () => {
      db.chainRegistry.findUnique.mockResolvedValue(CHAIN_1);
      db.chainRegistry.delete.mockResolvedValue(CHAIN_1);
      const app = buildApp();

      const res = await withAuth(request(app).delete("/admin/chains/chain-1"));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Chain deleted");
    });

    it("returns 404 when chain not found", async () => {
      db.chainRegistry.findUnique.mockResolvedValue(null);
      const app = buildApp();

      const res = await withAuth(request(app).delete("/admin/chains/nonexistent"));

      expect(res.status).toBe(404);
    });
  });
});
