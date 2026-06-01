import { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  createRegistration,
  verifyRegistration,
} from "../services/registrationService";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const RegisterSchema = z.object({
  email: z.string().email(),
  projectName: z.string().min(2).max(100),
  intendedUse: z.string().min(5).max(500),
  acceptTos: z
    .boolean()
    .refine((value) => value === true, {
      message: "You must accept the Terms of Service.",
    }),
});

const VerifySchema = z.object({
  token: z.string().length(64), // 32-byte hex = 64 chars
});

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    error: "Too many sign-up attempts from this IP. Please try again later.",
    code: "RATE_LIMITED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const verifyEmailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: "Too many verification attempts from this IP. Please try again later.",
    code: "RATE_LIMITED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /auth/register
 * Body: { email, projectName, intendedUse }
 */
export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const forwardedFor = req.header("x-forwarded-for");
    const realIp = req.header("x-real-ip");
    const forwardedIp = forwardedFor?.split(",")[0]?.trim();
    const tosAcceptedIp = forwardedIp || realIp || req.ip || "unknown";

    await createRegistration({
      ...parsed.data,
      tosAcceptedIp,
    });
    res.status(202).json({
      message:
        "Registration received. Please check your email to verify your address.",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/verify-email
 * Body: { token }
 */
export async function verifyEmailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = VerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid token format." });
    return;
  }

  try {
    const result = await verifyRegistration(parsed.data.token);
    res.status(200).json({
      apiKey: result.apiKey,
      tenantId: result.tenantId,
      projectName: result.projectName,
      email: result.email,
    });
  } catch (err: any) {
    // Surface user-facing errors as 400s; unexpected errors go to the global handler
    const userErrors = [
      "Invalid or expired verification token.",
      "Verification link has expired. Please sign up again.",
      "Free subscription tier not found.",
      "Terms of Service acceptance is required before API key issuance.",
      "Terms of Service has been updated.",
    ];
    if (userErrors.some((msg) => err?.message?.startsWith(msg.slice(0, 20)))) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
}
