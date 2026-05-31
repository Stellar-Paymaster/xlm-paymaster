import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockTenantFindUnique = vi.fn();

vi.mock("../utils/db", () => ({
  default: {
    apiKey: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
    },
  },
}));

vi.mock("../services/sandboxCleanup", () => ({
  purgeSandboxTenantData: vi.fn().mockResolvedValue({
    transactionsDeleted: 3,
    sponsoredDeleted: 1,
    webhookDeliveriesDeleted: 0,
  }),
}));

vi.mock("../middleware/apiKeys", () => ({
  invalidateCachedApiKey: vi.fn(),
}));

vi.mock("../utils/adminAuth", () => ({
  requireAdminToken: vi.fn().mockReturnValue(true),
}));

import { purgeSandboxTenantData } from "../services/sandboxCleanup";
import {
  autoResetStaleSandboxKeys,
  createSandboxApiKeyHandler,
  resetSandboxKey,
  sandboxResetHandler,
} from "./sandbox";

describe("sandbox handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );
  });

  describe("resetSandboxKey", () => {
    it("rotates fee payer secret and purges tenant data", async () => {
      mockFindUnique.mockResolvedValue({
        id: "key-1",
        key: "sandbox_key_abc",
        tenantId: "tenant-1",
        isSandbox: true,
      });
      mockUpdate.mockResolvedValue({});

      const result = await resetSandboxKey("key-1");

      expect(result.deletedTransactions).toBe(3);
      expect(result.funded).toBe(true);
      expect(result.sandboxPublicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "key-1" },
          data: expect.objectContaining({
            sandboxFeePayerSecret: expect.any(String),
            sandboxLastResetAt: expect.any(Date),
          }),
        }),
      );
      expect(purgeSandboxTenantData).toHaveBeenCalledWith("tenant-1");
    });

    it("throws when key is not a sandbox key", async () => {
      mockFindUnique.mockResolvedValue({ id: "key-1", isSandbox: false });
      await expect(resetSandboxKey("key-1")).rejects.toThrow(/Sandbox API key not found/);
    });
  });

  describe("autoResetStaleSandboxKeys", () => {
    it("resets all stale sandbox keys", async () => {
      mockFindMany.mockResolvedValue([{ id: "key-a" }, { id: "key-b" }]);
      mockFindUnique
        .mockResolvedValueOnce({
          id: "key-a",
          key: "k1",
          tenantId: "t1",
          isSandbox: true,
        })
        .mockResolvedValueOnce({
          id: "key-b",
          key: "k2",
          tenantId: "t2",
          isSandbox: true,
        });
      mockUpdate.mockResolvedValue({});

      const count = await autoResetStaleSandboxKeys(new Date("2026-06-01T00:00:00.000Z"));
      expect(count).toBe(2);
    });

    it("returns zero when no stale keys exist", async () => {
      mockFindMany.mockResolvedValue([]);
      await expect(autoResetStaleSandboxKeys()).resolves.toBe(0);
    });
  });

  describe("sandboxResetHandler", () => {
    it("rejects non-sandbox API keys", async () => {
      const req = {} as any;
      const res = { locals: { apiKey: { isSandbox: false, key: "prod-key" } } } as any;
      const next = vi.fn();

      await sandboxResetHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("sandbox") }),
      );
    });

    it("resets sandbox key for valid sandbox caller", async () => {
      mockFindUnique.mockResolvedValueOnce({ id: "key-1" });
      mockFindUnique.mockResolvedValueOnce({
        id: "key-1",
        key: "sandbox_key",
        tenantId: "tenant-1",
        isSandbox: true,
      });
      mockUpdate.mockResolvedValue({});

      const req = {} as any;
      const json = vi.fn();
      const res = {
        locals: { apiKey: { isSandbox: true, key: "sandbox_key" } },
        json,
      } as any;
      const next = vi.fn();

      await sandboxResetHandler(req, res, next);

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedTransactions: 3,
          funded: true,
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("createSandboxApiKeyHandler", () => {
    it("creates a sandbox key for a valid tenant", async () => {
      mockTenantFindUnique.mockResolvedValue({ id: "tenant-1", name: "Acme Labs" });
      mockCreate.mockResolvedValue({
        id: "new-key-id",
        key: "acme_sandbox_abc123",
        prefix: "acme_sandbox",
        tenantId: "tenant-1",
      });

      const req = {
        body: { tenantId: "tenant-1", name: "Sandbox Key" },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      await createSandboxApiKeyHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "new-key-id",
          sandboxPublicKey: expect.stringMatching(/^G[A-Z0-9]{55}$/),
          funded: true,
        }),
      );
    });
  });
});
