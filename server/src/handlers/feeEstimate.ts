import { NextFunction, Request, Response } from "express";
import { feeOracle } from "../services/feeOracle";

export function feeEstimateHandler() {
  return async function handleFeeEstimate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const chain = String(req.query.chain || "");
      const ops = req.query.ops ? Number(req.query.ops) : 1;

      if (!chain) {
        res.status(400).json({ error: "chain query parameter is required" });
        return;
      }

      if (Number.isNaN(ops) || ops < 1) {
        res.status(400).json({ error: "ops must be a positive integer" });
        return;
      }

      const result = await feeOracle.estimate(chain, ops);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
