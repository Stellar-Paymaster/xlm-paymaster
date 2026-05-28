import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processFeeBump } from "./feeBump";
import prisma from "../utils/db";

// Mock transaction ledger & helpers
vi.mock("../utils/db", () => {
  const mockPrisma = {
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "mock-tx-record-id" }),
      update: vi.fn().mockResolvedValue({ id: "mock-tx-record-id" }),
    },
  };
  return {
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

vi.mock("../services/quota", () => {
  return {
    checkTenantDailyQuota: vi.fn().mockResolvedValue({ allowed: true }),
  };
});

vi.mock("../services/feeManager", () => {
  return {
    getFeeManager: vi.fn().mockReturnValue({
      getMultiplier: vi.fn().mockReturnValue(2.0),
    }),
  };
});

// Mock Stellar SDK
vi.mock("@stellar/stellar-sdk", () => {
  const mockHash = Buffer.from("mockhashmockhashmockhashmockhash");
  const mockTx = {
    signatures: ["sig1"],
    operations: [{ type: "payment" }],
    hash: () => mockHash,
  };
  return {
    default: {
      TransactionBuilder: {
        fromXDR: () => mockTx,
        buildFeeBumpTransaction: () => ({
          sign: () => {},
          toXDR: () => "mock_bumped_xdr",
          hash: () => mockHash,
        }),
      },
    },
    Transaction: vi.fn(),
  };
});

describe("feeBump Shadow-mode", () => {
  const originalEnv = process.env.SHADOW_MODE;

  beforeEach(() => {
    process.env.SHADOW_MODE = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.SHADOW_MODE = originalEnv;
  });

  it("should bypass real signing/submitting and write SHADOW status when shadowMode parameter is true", async () => {
    const config = {
      baseFee: 100,
      feeMultiplier: 2.0,
      networkPassphrase: "Test SDF Network ; September 2015",
    } as any;

    const tenant = {
      id: "tenant-1",
      name: "Test Tenant",
    } as any;

    const feePayerAccount = {
      publicKey: "GB...",
      keypair: {} as any,
    } as any;

    const response = await processFeeBump(
      "mock_xdr",
      true, // submit
      config,
      tenant,
      feePayerAccount,
      true // shadowMode = true
    );

    expect(response.status).toBe("submitted");
    expect(response.hash).toBe("shadow_6d6f636b686173686d6f636b686173686d6f636b686173686d6f636b68617368"); // hex of "mockhash..."
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "mock-tx-record-id" },
      data: {
        status: "SHADOW",
        txHash: "shadow_6d6f636b686173686d6f636b686173686d6f636b686173686d6f636b68617368",
      },
    });
  });
});
