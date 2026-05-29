import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FluidClient } from "../src/FluidClient";
import { FluidNoAvailableServerError, FluidNetworkError, FluidRequestError, FluidServerError } from "../src/errors";

describe("Python SDK Parity", () => {
  const passphrase = "Test SDF Network ; September 2015";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Error Hierarchy", () => {
    it("should have consistent inheritance", () => {
      const networkErr = new FluidNetworkError("fail", "url");
      expect(networkErr).toBeInstanceOf(FluidRequestError);
      expect(networkErr.serverUrl).toBe("url");

      const serverErr = new FluidServerError("fail", 500, "url");
      expect(serverErr).toBeInstanceOf(FluidRequestError);
      expect(serverErr.statusCode).toBe(500);
    });
  });

  describe("URL Normalization Parity", () => {
    it("should preserve order and deduplicate servers like the Python SDK", () => {
      const client = new FluidClient({
        serverUrls: [
          "https://b.test",
          "https://a.test",
          "https://b.test/",
        ],
        networkPassphrase: passphrase,
      });

      expect((client as any).serverUrls).toEqual([
        "https://b.test",
        "https://a.test",
      ]);
    });
  });

  describe("Error Exhaustion", () => {
    it("should throw FluidNoAvailableServerError when all nodes fail", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Failed"));

      const client = new FluidClient({
        serverUrls: ["https://n1.test"],
        networkPassphrase: passphrase,
      });

      await expect(client.requestFeeBump("xdr")).rejects.toThrow(FluidNoAvailableServerError);
    });
  });
});
