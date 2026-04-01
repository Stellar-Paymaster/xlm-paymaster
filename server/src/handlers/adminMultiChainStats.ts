import { Request, Response } from "express";
import type { Config } from "../config";
import { getTreasuryOverview } from "../services/treasuryService";
import { requireAdminToken } from "../utils/adminAuth";

export function getMultiChainStatsHandler(config: Config) {
  return async function multiChainStatsHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!requireAdminToken(req, res)) {
      return;
    }

    try {
      const overview = await getTreasuryOverview(config);
      res.json(overview);
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch multi-chain treasury overview",
      });
    }
  };
}
