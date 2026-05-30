import { Request, Response } from "express";

export function fiatToFeeGatewayHandler(req: Request, res: Response) {
  res.json({
    status: "ok",
    message: "Fiat-to-Fee Gateway: Tenant top up via Credit Card successful.",
    amount: req.body.amount,
  });
}
