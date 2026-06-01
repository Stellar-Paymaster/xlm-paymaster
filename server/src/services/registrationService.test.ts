import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../utils/db";
import { createRegistration, verifyRegistration } from "./registrationService";

vi.mock("../utils/db", () => ({
  default: {
    pendingRegistration: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    termsAcceptanceAudit: {
      create: vi.fn(),
    },
    subscriptionTier: {
      findFirst: vi.fn(),
    },
    tenant: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    apiKey: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe("registrationService", () => {
  const mockPrisma = prisma as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TERMS_OF_SERVICE_VERSION", "2026-03-29");
    vi.stubEnv("REGISTRATION_VERIFY_BASE_URL", "http://localhost:3001");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("FLUID_ALERT_SMTP_HOST", "");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("stores ToS acceptance metadata and writes an acceptance audit record", async () => {
    mockPrisma.pendingRegistration.upsert.mockResolvedValue({});
    mockPrisma.termsAcceptanceAudit.create.mockResolvedValue({});

    await createRegistration({
      email: "dev@example.com",
      projectName: "My App",
      intendedUse: "Sponsor Stellar transactions",
      acceptTos: true,
      tosAcceptedIp: "203.0.113.5",
    });

    expect(mockPrisma.pendingRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "dev@example.com" },
        create: expect.objectContaining({
          tosAcceptedAt: expect.any(Date),
          tosAcceptedIp: "203.0.113.5",
          tosVersion: "2026-03-29",
          status: "pending",
        }),
        update: expect.objectContaining({
          tosAcceptedAt: expect.any(Date),
          tosAcceptedIp: "203.0.113.5",
          tosVersion: "2026-03-29",
          status: "pending",
        }),
      }),
    );

    expect(mockPrisma.termsAcceptanceAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "dev@example.com",
        projectName: "My App",
        tosVersion: "2026-03-29",
        acceptedIp: "203.0.113.5",
        acceptedAt: expect.any(Date),
      }),
    });
  });

  it("blocks API key issuance when ToS acceptance is missing", async () => {
    mockPrisma.pendingRegistration.findUnique.mockResolvedValue({
      email: "dev@example.com",
      projectName: "My App",
      status: "pending",
      tokenExpiresAt: new Date(Date.now() + 60_000),
      tosAcceptedAt: null,
      tosVersion: null,
    });

    await expect(verifyRegistration("a".repeat(64))).rejects.toThrow(
      "Terms of Service acceptance is required before API key issuance.",
    );
  });

  it("requires re-acceptance when the current ToS version has changed", async () => {
    mockPrisma.pendingRegistration.findUnique.mockResolvedValue({
      email: "dev@example.com",
      projectName: "My App",
      status: "pending",
      tokenExpiresAt: new Date(Date.now() + 60_000),
      tosAcceptedAt: new Date("2026-03-28T10:00:00.000Z"),
      tosAcceptedIp: "203.0.113.5",
      tosVersion: "2026-03-28",
    });

    await expect(verifyRegistration("b".repeat(64))).rejects.toThrow(
      "Terms of Service has been updated. Please re-accept the latest version and verify again.",
    );
  });

  it("persists accepted ToS data on tenant provisioning", async () => {
    const tosAcceptedAt = new Date("2026-03-29T10:00:00.000Z");

    mockPrisma.pendingRegistration.findUnique.mockResolvedValue({
      email: "dev@example.com",
      projectName: "My App",
      status: "pending",
      tokenExpiresAt: new Date(Date.now() + 60_000),
      tosAcceptedAt,
      tosAcceptedIp: "203.0.113.5",
      tosVersion: "2026-03-29",
    });
    mockPrisma.subscriptionTier.findFirst.mockResolvedValue({
      id: "free-tier",
      txLimit: 10000,
      rateLimit: 5,
    });
    mockPrisma.tenant.create.mockResolvedValue({ id: "tenant-1" });
    mockPrisma.apiKey.create.mockResolvedValue({});
    mockPrisma.pendingRegistration.update.mockResolvedValue({});

    const result = await verifyRegistration("c".repeat(64));

    expect(mockPrisma.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "My App",
        subscriptionTierId: "free-tier",
        tosAcceptedAt,
        tosAcceptedIp: "203.0.113.5",
        tosVersion: "2026-03-29",
      }),
    });
    expect(result.tenantId).toBe("tenant-1");
    expect(result.apiKey.startsWith("fluid_live_")).toBe(true);
  });
});
