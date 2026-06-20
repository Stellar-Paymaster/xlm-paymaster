import * as fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookService, signWebhookPayload, webhookLogger } from "./webhook";
import prisma from "../utils/db";

vi.mock("../utils/db", () => ({
  default: {
    tenant: {
      findUnique: vi.fn(),
    },
  },
}));

const mockPrisma = prisma as any;

describe("WebhookService", () => {
  let service: WebhookService;

  beforeEach(() => {
    service = new WebhookService();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(webhookLogger, "debug").mockImplementation(() => webhookLogger);
    vi.spyOn(webhookLogger, "info").mockImplementation(() => webhookLogger);
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("dispatch - tenant not found", () => {
    it("logs a warning and skips dispatch when tenant is not found", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      const warnSpy = vi.spyOn(webhookLogger, "warn").mockImplementation(() => webhookLogger);

      await service.dispatch("unknown-tenant", "hash-abc", "success");

      expect(fetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("dispatch - webhookUrl is null", () => {
    it("skips HTTP call when tenant has no webhookUrl", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        webhookSecret: "tenant-secret",
        webhookUrl: null,
        webhookEventTypes: null,
      });

      await service.dispatch("tenant-1", "hash-abc", "success");

      expect(fetch).not.toHaveBeenCalled();
    });

    it("makes zero HTTP calls for any input when webhookUrl is null", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.constantFrom("success" as const, "failed" as const),
          async (hash, status) => {
            const mockFetch = vi.fn();
            vi.stubGlobal("fetch", mockFetch);

            mockPrisma.tenant.findUnique.mockResolvedValue({
              id: "tenant-null",
              webhookSecret: "tenant-secret",
              webhookUrl: null,
              webhookEventTypes: null,
            });

            await service.dispatch("tenant-null", hash, status);

            return mockFetch.mock.calls.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("dispatch - successful delivery", () => {
    it("POSTs JSON payload with the Paymaster signature header", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        webhookSecret: "tenant-secret",
        webhookUrl: "https://example.com/webhook",
        webhookEventTypes: null,
      });
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      await service.dispatch("tenant-1", "hash-xyz", "success");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://example.com/webhook");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers["X-Paymaster-Signature-256"]).toBe(
        signWebhookPayload("tenant-secret", options.body)
      );

      const body = JSON.parse(options.body);
      expect(body).toEqual({
        eventType: "tx.success",
        hash: "hash-xyz",
        status: "success",
      });
    });

    it("dispatched payload contains exactly hash and status for any input", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.constantFrom("success" as const, "failed" as const),
          async (hash, status) => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
            vi.stubGlobal("fetch", mockFetch);

            mockPrisma.tenant.findUnique.mockResolvedValue({
              id: "tenant-1",
              webhookSecret: "tenant-secret",
              webhookUrl: "https://example.com/hook",
              webhookEventTypes: null,
            });

            await service.dispatch("tenant-1", hash, status);

            if (mockFetch.mock.calls.length !== 1) {
              return false;
            }

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            return (
              body.hash === hash &&
              body.status === status &&
              body.eventType === (status === "success" ? "tx.success" : "tx.failed") &&
              Object.keys(body).length === 3
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it("signs the exact serialized JSON body with HMAC-SHA256", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.constantFrom("success" as const, "failed" as const),
          fc.string({ minLength: 1 }),
          async (hash, status, secret) => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
            vi.stubGlobal("fetch", mockFetch);

            mockPrisma.tenant.findUnique.mockResolvedValue({
              id: "tenant-1",
              webhookSecret: secret,
              webhookUrl: "https://example.com/hook",
              webhookEventTypes: null,
            });

            await service.dispatch("tenant-1", hash, status);

            if (mockFetch.mock.calls.length !== 1) {
              return false;
            }

            const [, options] = mockFetch.mock.calls[0];
            return (
              options.headers["X-Paymaster-Signature-256"] ===
              signWebhookPayload(secret, options.body)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it("defaults to all event types when no explicit filter is configured", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-default",
        webhookSecret: "tenant-secret",
        webhookUrl: "https://example.com/webhook",
        webhookEventTypes: null,
      });
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      await service.dispatch("tenant-default", "hash-default", "failed");

      expect(mockFetch).toHaveBeenCalledOnce();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.eventType).toBe("tx.failed");
    });

    it("skips dispatch when the tenant disables the event type", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-filtered",
        webhookSecret: "tenant-secret",
        webhookUrl: "https://example.com/webhook",
        webhookEventTypes: JSON.stringify(["tx.failed"]),
      });
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      await service.dispatch("tenant-filtered", "hash-filtered", "success");

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("dispatch - error handling", () => {
    it("logs and skips dispatch when the tenant has no webhook secret", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        webhookSecret: null,
        webhookUrl: "https://example.com/webhook",
        webhookEventTypes: null,
      });
      const errorSpy = vi.spyOn(webhookLogger, "error").mockImplementation(() => webhookLogger);

      await service.dispatch("tenant-1", "hash-missing-secret", "success");

      expect(fetch).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-1",
          tx_hash: "hash-missing-secret",
          webhook_url: "https://example.com/webhook",
        }),
        "Tenant has no webhook secret configured; refusing unsigned webhook dispatch"
      );
      errorSpy.mockRestore();
    });

    it("logs error and does not throw on non-2xx response", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        webhookSecret: "tenant-secret",
        webhookUrl: "https://example.com/webhook",
        webhookEventTypes: null,
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      const errorSpy = vi.spyOn(webhookLogger, "error").mockImplementation(() => webhookLogger);

      await expect(service.dispatch("tenant-1", "hash-err", "failed")).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("logs error and does not throw on network error", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        webhookSecret: "tenant-secret",
        webhookUrl: "https://example.com/webhook",
        webhookEventTypes: null,
      });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));
      const errorSpy = vi.spyOn(webhookLogger, "error").mockImplementation(() => webhookLogger);

      await expect(service.dispatch("tenant-1", "hash-net", "success")).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("never throws for any error condition", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.constantFrom("success" as const, "failed" as const),
          fc.oneof(
            fc.integer({ min: 400, max: 599 }).map((code) => ({ ok: false, status: code })),
            fc.constant(null)
          ),
          async (hash, status, responseOrNull) => {
            vi.spyOn(webhookLogger, "error").mockImplementation(() => webhookLogger);
            vi.spyOn(webhookLogger, "warn").mockImplementation(() => webhookLogger);

            if (responseOrNull === null) {
              vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
            } else {
              vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOrNull));
            }

            mockPrisma.tenant.findUnique.mockResolvedValue({
              id: "tenant-1",
              webhookSecret: "tenant-secret",
              webhookUrl: "https://example.com/hook",
              webhookEventTypes: null,
            });

            await service.dispatch("tenant-1", hash, status);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
