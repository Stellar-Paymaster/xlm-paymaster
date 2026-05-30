import { Request, Response } from "express";

export function enterpriseWhiteLabelHandler(req: Request, res: Response) {
  res.json({
    status: "ok",
    message: "White-label platform for enterprises enabled.",
    tenantId: req.body.tenantId,
  });
}
