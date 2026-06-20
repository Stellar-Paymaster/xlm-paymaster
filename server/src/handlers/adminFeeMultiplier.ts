import { Request, Response } from "express";
import { getFeeManager } from "../services/feeManager";

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.PAYMASTER_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export function getFeeMultiplierHandler(req: Request, res: Response): void {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const snapshot = getFeeManager()?.getSnapshot();
  if (!snapshot) {
    res.status(503).json({ error: "Fee manager is not initialized" });
    return;
  }

  res.json({
    multiplier: snapshot.multiplier,
    congestionLevel: snapshot.congestionLevel,
    reason: snapshot.lastReason,
    updatedAt: snapshot.updatedAt,
  });
}
