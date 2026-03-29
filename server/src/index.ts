import "dotenv/config"; 
import { updateConfigsHandler } from "./handlers/adminConfigs";

import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import {
  listApiKeysHandler,
  revokeApiKeyHandler,
  upsertApiKeyHandler,
} from "./handlers/adminApiKeys";
import {
  listWebhookSettingsHandler,
  updateWebhookSettingsHandler,
} from "./handlers/adminWebhooks";
import {
  addSignerHandler,
  listSignersHandler,
  removeSignerHandler,
} from "./handlers/adminSigners";
import { feeBumpBatchHandler, feeBumpHandler } from "./handlers/feeBump";
import {
  createCheckoutSessionHandler,
  stripeWebhookHandler,
} from "./handlers/stripe";
import {
  getWebhookSettingsHandler,
  updateWebhookHandler,
} from "./handlers/tenantWebhook";
import { getHorizonFailoverClient, initializeHorizonFailoverClient } from "./horizon/failoverClient";
import { AppError } from "./errors/AppError";
import { apiKeyMiddleware } from "./middleware/apiKeys";
import {
  createGlobalErrorHandler,
  notFoundHandler,
} from "./middleware/errorHandler";
import { apiKeyRateLimit } from "./middleware/rateLimit";
import { AlertService } from "./services/alertService";
import {
  hydratePersistedSigners,
  listAdminSigners,
} from "./services/signerRegistry";
import {
  loadSlackNotifierOptionsFromEnv,
  SlackNotifier,
} from "./services/slackNotifier";
import { createLogger, serializeError } from "./utils/logger";
import redisClient from "./utils/redis";
import { RedisRateLimitStore } from "./utils/redisRateLimitStore";
import { loadConfig } from "./config";
import { initializeBalanceMonitor } from "./workers/balanceMonitor";
import { getLedgerMonitor, initializeLedgerMonitor } from "./workers/ledgerMonitor";
import { transactionStore } from "./workers/transactionStore";
import { healthHandler } from "./handlers/health";

import { authMiddleware } from "./middleware/auth";
const PORT = process.env.PORT || 8000;

const app = express();
app.use(express.json());

// Initialize config after dotenv has loaded the variables
const config = loadConfig();
const slackNotifier = new SlackNotifier(loadSlackNotifierOptionsFromEnv());
const alertingConfig = {
  slackNotifier,
  checkIntervalMs: 60000,
  cooldownMs: 300000,
};
const alertService = new AlertService(alertingConfig);

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: {
    error: "Too many requests from this IP, please try again later.",
    code: "RATE_LIMITED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
const corsOptions = {
  credentials: true,
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, false);
      return;
    }
    if (
      config.allowedOrigins.includes("*") ||
      config.allowedOrigins.includes(origin)
    ) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed by CORS"), false);
  },
};

app.use(cors(corsOptions));

// Handle CORS errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err.message === "Origin not allowed by CORS") {
    return next(new AppError("CORS not allowed", 403, "AUTH_FAILED"));
  }

  next(err);
});

// Health check
app.get("/health", (req: Request, res: Response, next: NextFunction) => {
  healthHandler(req, res, next, config);
});

// Protected Fee Bump Route (Generic Middleware)
app.post(
  "/fee-bump",
  authMiddleware, 
  apiKeyRateLimit,
  limiter,
  (req: Request, res: Response, next: NextFunction) => {
    feeBumpHandler(req, res, next, config);
  },
);

// Tenant Webhook Management
app.patch("/tenant/webhook", authMiddleware, updateWebhookHandler);

app.get(
  "/tenant/webhook-settings",
  apiKeyMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    void getWebhookSettingsHandler(req, res, next);
  },
);
app.patch("/admin/configs", updateConfigsHandler);

app.patch(
  "/tenant/webhook-settings",
  apiKeyMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    void updateWebhookHandler(req, res, next);
  },
);

app.post("/test/add-transaction", (req: Request, res: Response) => {
  const { hash, status = "pending" } = req.body;
  if (!hash) return res.status(400).json({ error: "Transaction hash required" });
  transactionStore.addTransaction(hash, "test", status);
  res.json({ message: `Transaction ${hash} added` });
});

app.get("/test/transactions", (req: Request, res: Response) => {
  res.json({ transactions: transactionStore.getAllTransactions() });
});

app.post(
  "/test/alerts/low-balance",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!alertService.isEnabled()) {
        res.status(400).json({
          error:
            "No alert transport configured. Set Slack webhook or SMTP env vars first.",
        });
        return;
      }

      await alertService.sendTestAlert(config);
      res.json({ message: "Test low-balance alert sent" });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/admin/api-keys", listApiKeysHandler);
app.post("/admin/api-keys", upsertApiKeyHandler);
app.patch("/admin/api-keys/:key/revoke", revokeApiKeyHandler);
app.delete("/admin/api-keys/:key", revokeApiKeyHandler);
app.get("/admin/webhooks", listWebhookSettingsHandler);
app.patch("/admin/webhooks/:tenantId", updateWebhookSettingsHandler);
app.get("/admin/signers", listSignersHandler(config));
app.post("/admin/signers", addSignerHandler(config));
app.delete("/admin/signers/:publicKey", removeSignerHandler(config));

app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);
app.post("/create-checkout-session", createCheckoutSessionHandler);

 
app.use(notFoundHandler);
app.use(createGlobalErrorHandler(slackNotifier));

let balanceMonitor: ReturnType<typeof initializeBalanceMonitor> | null = null;
let ledgerMonitor: ReturnType<typeof initializeLedgerMonitor> | null = null;
let shuttingDown = false;
let server: ReturnType<typeof app.listen> | null = null;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await slackNotifier.notifyServerLifecycle({
    detail: `Signal received: ${signal}`,
    phase: "stop",
    timestamp: new Date(),
  });

  ledgerMonitor?.stop();
  balanceMonitor?.stop();

  if (server) {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
    return;
  }

  process.exit(0);
}

// --- Background Workers ---

if (config.horizonUrl) {
  try {
    ledgerMonitor = initializeLedgerMonitor(config);
    ledgerMonitor.start();
    console.log("Ledger monitor worker started");
  } catch (error) {
    console.error("Failed to start ledger monitor:", error);
  }
}

// Final Server Start
app.listen(PORT, () => {
  console.log(`Fluid server running on http://0.0.0.0:${PORT}`);
  console.log(`Fee payers loaded: ${config.feePayerAccounts.length}`);
});
