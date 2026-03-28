import type { Request, Response, NextFunction } from "express";
import { createLogger, serializeError } from "../utils/logger";
import { getDigestWorker } from "../workers/digestWorker";
import { resolveDigestEmailTransport, DigestService } from "../services/digestService";

const logger = createLogger({ component: "digest_handler" });

// ────────────────────────────────────────────────────────────────────────────
// POST /admin/digest/unsubscribe?email=...&token=...
// ────────────────────────────────────────────────────────────────────────────

export async function digestUnsubscribeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const email =
      typeof req.query.email === "string"
        ? req.query.email.trim()
        : typeof req.body?.email === "string"
          ? req.body.email.trim()
          : "";

    const token =
      typeof req.query.token === "string"
        ? req.query.token.trim()
        : typeof req.body?.token === "string"
          ? req.body.token.trim()
          : "";

    if (!email || !token) {
      res.status(400).json({ error: "email and token are required" });
      return;
    }

    const transport = resolveDigestEmailTransport();
    const service = new DigestService({
      // Transport may be undefined if email not configured; unsubscribe still works
      emailTransport: transport ?? {
        kind: "resend",
        apiKey: "",
        apiUrl: "",
        from: "",
        to: [],
      },
      unsubscribeSecret:
        process.env.DIGEST_UNSUBSCRIBE_SECRET?.trim() || "digest-unsubscribe",
    });

    const ok = await service.unsubscribe(email, token);
    if (!ok) {
      res.status(403).json({ error: "Invalid unsubscribe token" });
      return;
    }

    logger.info({ email }, "Operator unsubscribed from daily digest");
    res.json({ message: `Successfully unsubscribed ${email} from daily digests.` });
  } catch (error) {
    next(error);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /admin/digest/send-now   (admin-only, uses FLUID_ADMIN_TOKEN)
// ────────────────────────────────────────────────────────────────────────────

export async function sendDigestNowHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const worker = getDigestWorker();
    if (!worker) {
      res.status(503).json({
        error:
          "Daily digest worker not running — configure email transport env vars first.",
      });
      return;
    }

    await worker.runNow();
    res.json({ message: "Daily digest sent successfully." });
  } catch (error) {
    logger.error({ ...serializeError(error) }, "Manual digest send failed");
    next(error);
  }
}
