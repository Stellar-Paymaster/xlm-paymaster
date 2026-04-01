import { Request, Response } from "express";
import prisma from "../utils/db";

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.FLUID_ADMIN_TOKEN;

  if (!expected || (token !== expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export async function listBridgeSettlementsHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  try {
    const settlements = await prisma.crossChainSettlement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ 
      settlements: settlements.map((s) => ({
        ...s,
        amount: s.amount.toString(),
      }))
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch settlements" });
  }
}

export async function resolveBridgeSettlementHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { id } = req.params;
  const { status, targetTxHash, error } = req.body;

  if (!["COMPLETED", "FAILED", "PENDING"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  try {
    const updated = await prisma.crossChainSettlement.update({
      where: { id },
      data: { 
        status, 
        targetTxHash: targetTxHash || undefined,
        error: error || null,
        updatedAt: new Date()
      },
    });

    res.json({ ok: true, settlement: { ...updated, amount: updated.amount.toString() } });
  } catch (error) {
    res.status(500).json({ error: "Failed to update settlement" });
  }
}

export async function refundBridgeSettlementHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const { id } = req.params;

  try {
    const updated = await prisma.crossChainSettlement.update({
      where: { id },
      data: { 
        status: "REFUNDED",
        updatedAt: new Date()
      },
    });

    res.json({ ok: true, settlement: { ...updated, amount: updated.amount.toString() } });
  } catch (error) {
    res.status(500).json({ error: "Failed to refund settlement" });
  }
}
