import { Request, Response } from "express";
import { priceService } from "../services/priceService";

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.PAYMASTER_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export async function getPriceHandler(req: Request, res: Response) {
  if (!requireAdminToken(req, res)) return;

  try {
    const xlmPriceUsd = await priceService.getTokenPriceUsd("XLM");
    const usdcPriceUsd = await priceService.getTokenPriceUsd("USDC");
    const xlmUsdcRate = await priceService.getXlmUsdcPrice();

    res.json({
      prices: {
        xlm_usd: xlmPriceUsd.toString(),
        usdc_usd: usdcPriceUsd.toString(),
        xlm_usdc: xlmUsdcRate.toString(),
      },
      safetyBuffer: priceService.getSafetyBuffer(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: `Failed to fetch prices: ${error.message}` });
  }
}
