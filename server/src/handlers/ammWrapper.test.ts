import { describe, it, expect, vi, beforeEach } from "vitest";
import { ammSwapHandler } from "./ammWrapper";
import { Request, Response } from "express";
import { Config } from "../config";

// Mock the AmmWrapperService
vi.mock("../services/ammWrapper", () => {
  return {
    AmmWrapperService: vi.fn().mockImplementation(() => {
      return {
        buildSwapTransaction: vi.fn().mockReturnValue("mock_xdr"),
        processSponseredSwap: vi.fn().mockResolvedValue({
          xdr: "mock_sponsored_xdr",
          status: "submitted",
          hash: "mock_hash",
          fee_payer: "mock_fee_payer",
        }),
      };
    }),
  };
});

describe("ammSwapHandler", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: any;
  let mockConfig: Config;

  beforeEach(() => {
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      locals: {
        apiKey: {
          id: "key-id",
          tenantId: "tenant-id",
          dailyQuotaStroops: 1000000n,
          allowedChains: "stellar",
          active: true,
        },
      },
    };
    mockNext = vi.fn();
    mockConfig = {
      networkPassphrase: "Test SDF Network ; September 2015",
    } as any;
  });

  it("should fail when parameters are missing and XDR is missing", async () => {
    mockReq = {
      body: {},
    };

    await ammSwapHandler(mockReq as Request, mockRes as Response, mockNext, mockConfig);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should build unsigned swap transaction when swap parameters are provided", async () => {
    mockReq = {
      body: {
        ammContractId: "CCW775PP44QQ33EERRTTYYUUIIOOPP112233445566778899AABBCCDD",
        userPublicKey: "GBXXYYZZ112233445566778899AABBCCDDEEFFGGHHIIJJKKLLMMNNOO",
        tokenA: "GAAAAABBBBBCCCCCDDDDDDEEEEEFFFFFFGGGGGGHHHHHIIIIJJKKKLLL",
        tokenB: "GMMMMNNNNOOOOPPPPQQQQRRRRSSSSTTTTUUUUVVVVWWWWXXXYYYZZZAA",
        amount: "10000",
        minAmountOut: "9900",
      },
    };

    await ammSwapHandler(mockReq as Request, mockRes as Response, mockNext, mockConfig);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        xdr: "mock_xdr",
        status: "ready",
      })
    );
  });
});
