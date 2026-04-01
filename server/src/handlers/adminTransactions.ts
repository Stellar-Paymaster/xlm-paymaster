import { Request, Response } from "express";
import prisma from "../utils/db";

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.FLUID_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export async function listTransactionsHandler(req: Request, res: Response): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  const limit = Number.parseInt(String(req.query.limit ?? "250"), 10);
  const take = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 250;

  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        txHash: true,
        innerTxHash: true,
        tenantId: true,
        status: true,
        costStroops: true,
        category: true,
        createdAt: true,
      },
    });

    res.json({
      transactions: transactions.map((transaction: any) => ({
        id: transaction.id,
        hash: transaction.txHash ?? transaction.innerTxHash,
        txHash: transaction.txHash,
        innerTxHash: transaction.innerTxHash,
        tenantId: transaction.tenantId ?? null,
        status: transaction.status.toLowerCase(),
        costStroops: Number(transaction.costStroops),
        category: transaction.category,
        createdAt: transaction.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list transactions",
    });
  }
}
