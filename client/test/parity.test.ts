import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PaymasterClient } from "../src/PaymasterClient";
import { PaymasterNoAvailableServerError, PaymasterNetworkError, PaymasterRequestError, PaymasterServerError } from "../src/errors";

describe("Python SDK Parity", () => {
  const passphrase = "Test SDF Network ; September 2015";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Error Hierarchy", () => {
    it("should have consistent inheritance", () => {
      const networkErr = new PaymasterNetworkError("fail", "url");
      expect(networkErr).toBeInstanceOf(PaymasterRequestError);
      expect(networkErr.serverUrl).toBe("url");

      const serverErr = new PaymasterServerError("fail", 500, "url");
      expect(serverErr).toBeInstanceOf(PaymasterRequestError);
      expect(serverErr.statusCode).toBe(500);
    });
  });

  describe("URL Normalization Parity", () => {
    it("should preserve order and deduplicate servers like the Python SDK", () => {
      const client = new PaymasterClient({
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
    it("should throw PaymasterNoAvailableServerError when all nodes fail", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Failed"));

      const client = new PaymasterClient({
        serverUrls: ["https://n1.test"],
        networkPassphrase: passphrase,
      });

      await expect(client.requestFeeBump("xdr")).rejects.toThrow(PaymasterNoAvailableServerError);
    });
  });
});
