import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FcmNotifier,
  loadFcmCredentials,
  type FcmCredentials,
} from "./fcmNotifier";

const TEST_CREDENTIALS: FcmCredentials = {
  projectId: "test-project",
  clientEmail: "test@test-project.iam.gserviceaccount.com",
  privateKey: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
};

function makeMockAdmin(successCount = 1, failureCount = 0) {
  const sendEachForMulticast = vi.fn().mockResolvedValue({
    successCount,
    failureCount,
    responses: Array.from({ length: successCount + failureCount }, (_, i) => ({
      success: i < successCount,
      error: i >= successCount ? { code: "messaging/invalid-token", message: "Invalid token" } : undefined,
    })),
  });

  const mockApp = {
    messaging: () => ({ sendEachForMulticast }),
  };

  const mockAdmin = {
    apps: [] as unknown[],
    initializeApp: vi.fn().mockReturnValue(mockApp),
    credential: {
      cert: vi.fn().mockReturnValue({}),
    },
  };

  return { mockAdmin, mockApp, sendEachForMulticast };
}

describe("loadFcmCredentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when env vars are missing", () => {
    vi.stubEnv("FCM_PROJECT_ID", "");
    vi.stubEnv("FCM_CLIENT_EMAIL", "");
    vi.stubEnv("FCM_PRIVATE_KEY", "");
    expect(loadFcmCredentials()).toBeUndefined();
  });

  it("returns credentials when all three env vars are set", () => {
    vi.stubEnv("FCM_PROJECT_ID", "my-project");
    vi.stubEnv("FCM_CLIENT_EMAIL", "svc@my-project.iam.gserviceaccount.com");
    vi.stubEnv("FCM_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----\\nfake\\n-----END RSA PRIVATE KEY-----");

    const creds = loadFcmCredentials();
    expect(creds).toEqual({
      projectId: "my-project",
      clientEmail: "svc@my-project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
    });
  });

  it("returns undefined when only some vars are set", () => {
    vi.stubEnv("FCM_PROJECT_ID", "my-project");
    vi.stubEnv("FCM_CLIENT_EMAIL", "");
    vi.stubEnv("FCM_PRIVATE_KEY", "");
    expect(loadFcmCredentials()).toBeUndefined();
  });
});

describe("FcmNotifier", () => {
  describe("isConfigured", () => {
    it("returns false when credentials are undefined", () => {
      const notifier = new FcmNotifier(undefined);
      expect(notifier.isConfigured()).toBe(false);
    });

    it("returns true when credentials are provided", () => {
      const notifier = new FcmNotifier(TEST_CREDENTIALS);
      expect(notifier.isConfigured()).toBe(true);
    });
  });

  describe("notifyLowBalance", () => {
    it("returns 0 and skips send when not configured", async () => {
      const getTokens = vi.fn().mockResolvedValue(["token1"]);
      const notifier = new FcmNotifier(undefined, { getTokens });
      const count = await notifier.notifyLowBalance({
        accountPublicKey: "GXXX",
        balanceXlm: 5,
        thresholdXlm: 50,
      });
      expect(count).toBe(0);
      expect(getTokens).not.toHaveBeenCalled();
    });

    it("returns 0 when no device tokens are registered", async () => {
      const { mockAdmin } = makeMockAdmin();
      const notifier = new FcmNotifier(TEST_CREDENTIALS, {
        getTokens: vi.fn().mockResolvedValue([]),
        loadFirebaseAdmin: () => mockAdmin as any,
      });

      const count = await notifier.notifyLowBalance({
        accountPublicKey: "GXXX",
        balanceXlm: 5,
        thresholdXlm: 50,
      });
      expect(count).toBe(0);
    });

    it("sends multicast and returns successCount", async () => {
      const { mockAdmin, sendEachForMulticast } = makeMockAdmin(2, 0);
      const notifier = new FcmNotifier(TEST_CREDENTIALS, {
        getTokens: vi.fn().mockResolvedValue(["token1", "token2"]),
        loadFirebaseAdmin: () => mockAdmin as any,
        dashboardUrl: "https://example.com",
      });

      const count = await notifier.notifyLowBalance({
        accountPublicKey: "GXXX",
        balanceXlm: 5.12,
        thresholdXlm: 50,
      });

      expect(count).toBe(2);
      expect(sendEachForMulticast).toHaveBeenCalledOnce();
      const msg = sendEachForMulticast.mock.calls[0][0];
      expect(msg.tokens).toEqual(["token1", "token2"]);
      expect(msg.notification.title).toBe("Low fee-payer balance");
      expect(msg.notification.body).toContain("5.12");
      expect(msg.data.deep_link).toContain("/admin/dashboard");
      expect(msg.data.type).toBe("low_balance");
    });
  });

  describe("notifyServerDown", () => {
    it("sends push with server_down deep link", async () => {
      const { mockAdmin, sendEachForMulticast } = makeMockAdmin(1, 0);
      const notifier = new FcmNotifier(TEST_CREDENTIALS, {
        getTokens: vi.fn().mockResolvedValue(["token1"]),
        loadFirebaseAdmin: () => mockAdmin as any,
        dashboardUrl: "https://example.com",
      });

      await notifier.notifyServerDown({ reason: "Horizon unreachable for over 60 seconds" });

      const msg = sendEachForMulticast.mock.calls[0][0];
      expect(msg.notification.title).toBe("Paymaster server alert");
      expect(msg.data.deep_link).toContain("/admin/signers");
      expect(msg.data.type).toBe("server_down");
    });
  });

  describe("notifyTransactionFailure", () => {
    it("sends push with transaction_failure deep link", async () => {
      const { mockAdmin, sendEachForMulticast } = makeMockAdmin(1, 0);
      const notifier = new FcmNotifier(TEST_CREDENTIALS, {
        getTokens: vi.fn().mockResolvedValue(["token1"]),
        loadFirebaseAdmin: () => mockAdmin as any,
        dashboardUrl: "https://example.com",
      });

      await notifier.notifyTransactionFailure({
        transactionHash: "abc123",
        tenantId: "tenant-1",
        detail: "Transaction timed out",
      });

      const msg = sendEachForMulticast.mock.calls[0][0];
      expect(msg.notification.title).toBe("Transaction failure");
      expect(msg.data.deep_link).toContain("/admin/transactions");
      expect(msg.data.type).toBe("transaction_failure");
      expect(msg.data.transactionHash).toBe("abc123");
    });
  });

  describe("getRegisteredTokens", () => {
    it("delegates to injected getTokens function", async () => {
      const getTokens = vi.fn().mockResolvedValue(["tok-a", "tok-b"]);
      const notifier = new FcmNotifier(TEST_CREDENTIALS, { getTokens });
      const tokens = await notifier.getRegisteredTokens();
      expect(tokens).toEqual(["tok-a", "tok-b"]);
    });
  });
});
