import { Request, Response } from "express";
import { Config } from "../config";
import { calculateSpendForecast } from "../services/spendForecast";
import { replicaDb as prisma } from "../utils/db";

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.FLUID_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

function totalSignerBalanceStroops(config: Config): bigint {
  return config.signerPool
    .getSnapshot()
    .filter((account) => typeof account.balance === "string")
    .reduce((total, account) => total + BigInt(account.balance ?? "0"), 0n);
}

export function getSpendForecastHandler(config: Config) {
  return async function spendForecastHandler(req: Request, res: Response): Promise<void> {
    if (!requireAdminToken(req, res)) {
      return;
    }

    try {
      const now = new Date();
      const windowStart = new Date(now);
      windowStart.setUTCDate(windowStart.getUTCDate() - 29);
      windowStart.setUTCHours(0, 0, 0, 0);

      const transactions = await prisma.transaction.findMany({
        where: {
          status: "SUCCESS",
          createdAt: { gte: windowStart },
        },
        select: {
          costStroops: true,
          createdAt: true,
        },
      });

      const forecast = calculateSpendForecast({
        currentBalanceStroops: totalSignerBalanceStroops(config),
        transactions,
      });

      res.json({
        ...forecast,
        runwayMessage:
          forecast.runwayDays === null
            ? "At current spend rate, balance lasts indefinitely"
            : `At current spend rate, balance lasts ~${Math.max(0, Math.round(forecast.runwayDays))} days`,
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to calculate spend forecast",
      });
    }
  };
}
