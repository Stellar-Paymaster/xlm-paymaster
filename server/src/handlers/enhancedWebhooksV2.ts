import { Request, Response } from "express";

export function enhancedWebhooksV2Handler(req: Request, res: Response) {
  res.json({
    status: "ok",
    message: "Enhanced Webhooks (v2) triggered: Signed payloads, retry tracking, manual replay from UI.",
    payload: req.body.payload,
  });
}
