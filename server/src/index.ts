import "dotenv/config";

import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { loadConfig } from "./config";
import { AppError } from "./errors/AppError";
import {
  listApiKeysHandler,
  revokeApiKeyHandler,
  updateApiKeyChainsHandler,
  upsertApiKeyHandler,
} from "./handlers/adminApiKeys";
import {
  deleteDeviceTokenHandler,
  listDeviceTokensHandler,
  registerDeviceTokenHandler,
} from "./handlers/adminDeviceTokens";
import {
  deleteDlqHandler,
  listDlqHandler,
  replayDlqHandler,
} from "./handlers/adminDlq";
import {
  createNotificationHandler,
  listNotificationsHandler,
  markAllReadHandler,
  markReadHandler,
  notificationSseHandler,
} from "./handlers/adminNotifications";
import { getPriceHandler } from "./handlers/adminPrice";
import {
  addSignerHandler,
  listSignersHandler,
  removeSignerHandler,
} from "./handlers/adminSigners";
import {
  listSubscriptionTiersHandler,
  updateTenantSubscriptionTierHandler,
} from "./handlers/adminSubscriptionTiers";
import { badgeHandler } from "./handlers/badge";
import { feeBumpBatchHandler, feeBumpHandler } from "./handlers/feeBump";
import {
  incidentsHandler,
  statusPageHandler,
  subscribeHandler,
  unsubscribeHandler,
  uptimeHandler,
} from "./handlers/statusPage";
import {
  createCheckoutSessionHandler,
  stripeWebhookHandler,
} from "./handlers/stripe";
import { getHorizonFailoverClient } from "./horizon/failoverClient";
import { apiKeyMiddleware } from "./middleware/apiKeys";
import { soc2RequestLogger } from "./middleware/soc2Logger";
import {
  createGlobalErrorHandler,
  notFoundHandler,
} from "./middleware/errorHandler";
import { apiKeyRateLimit } from "./middleware/rateLimit";
import { tenantTierTxLimit } from "./middleware/txLimit";
import { AlertService } from "./services/alertService";
import { initializeFcmNotifier } from "./services/fcmNotifier";
import { PagerDutyNotifier } from "./services/pagerDutyNotifier";
import {
  loadSlackNotifierOptionsFromEnv,
  SlackNotifier,
} from "./services/slackNotifier";
import { StatusMonitorService } from "./services/statusMonitorService";
import prisma from "./utils/db";
import { createLogger, serializeError } from "./utils/logger";
import redisClient from "./utils/redis";
import { RedisRateLimitStore } from "./utils/redisRateLimitStore";
import { swaggerSpec } from "./swagger";
import { initializeBalanceMonitor } from "./workers/balanceMonitor";
import { initializeIncidentMonitor } from "./workers/incidentMonitor";
import {
  getLedgerMonitor,
  initializeLedgerMonitor,
} from "./workers/ledgerMonitor";
import { healthHandler } from "./handlers/health";
import {
  digestUnsubscribeHandler,
  sendDigestNowHandler,
} from "./handlers/digest";
import { securityTxtHandler } from "./handlers/securityTxt";
import {
  createChainHandler,
  deleteChainHandler,
  listChainsHandler,
  updateChainHandler,
} from "./handlers/adminChains";
import {
  adminLoginHandler,
  changeAdminPasswordHandler,
  listAdminUsersHandler,
  createAdminUserHandler,
  updateAdminUserRoleHandler,
  deactivateAdminUserHandler,
} from "./handlers/adminUsers";
import { listTransactionsHandler } from "./handlers/adminTransactions";
import {
  listSARReportsHandler,
  getSARReportHandler,
  reviewSARReportHandler,
  getSARStatsHandler,
  exportSARReportsHandler
} from "./handlers/adminSAR";
import { getSpendForecastHandler } from "./handlers/adminAnalytics";
import { getFeeMultiplierHandler } from "./handlers/adminFeeMultiplier";
import { estimateFeeHandler } from "./handlers/estimate";
import { initializeDigestWorker } from "./workers/digestWorker";
import { initializeTenantErasureWorker, TenantErasureWorker } from "./workers/tenantErasureWorker";

import { initializeTreasuryRefill } from "./workers/treasuryRefill";
import { initializeTreasurySweeper } from "./tasks/sweeper";
import { TreasuryRebalancer } from "./services/treasuryRebalancer";
import { initializeFeeManager } from "./services/feeManager";
import { initializeOFACScreening, stopOFACScreening } from "./services/ofacScreening";
import { initializeRegionalDbs, DEFAULT_REGION } from "./services/regionRouter";
import { requireAuthenticatedAdmin, requirePermission } from "./utils/adminAuth";
import { ensureAuditLogTableIntegrity } from "./services/auditLogger";
import { ipFilterMiddleware } from "./middleware/ipFilter";
import { deleteCurrentTenantHandler, deleteTenantByAdminHandler } from "./handlers/tenantErasure";
import { listAuditLogsHandler } from "./handlers/adminAuditLogs";
import { exportAuditLogHandler } from "./handlers/adminAuditLog";
import { getMultiChainStatsHandler } from "./handlers/adminMultiChainStats";
import { startAuditSummaryWorker } from "./services/auditLog";
import { dailyScoringWorker } from "./workers/dailyScoringWorker";
import {
  startChainRegistryHotReload,
  stopChainRegistryHotReload,
} from "./services/chainRegistryService";

const logger = createLogger({ component: "server" });
const config = loadConfig();

async function initializeAuditLog() {
  try {
    await ensureAuditLogTableIntegrity();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      "Failed to initialize audit log integrity",
    );
  }
}

initializeAuditLog();
initializeRegionalDbs();

initializeOFACScreening();
const feeManager = initializeFeeManager(config);
const slackNotifier = new SlackNotifier(loadSlackNotifierOptionsFromEnv());
const pagerDutyNotifier = new PagerDutyNotifier();
const fcmNotifier = initializeFcmNotifier();

if (fcmNotifier.isConfigured()) {
  logger.info("FCM push notifications enabled");
} else {
  logger.info(
    "FCM push notifications disabled - FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY not set",
  );
}
const treasuryRebalancer = new TreasuryRebalancer(config);
const alertService = new AlertService(config.alerting, slackNotifier, {
  fcmNotifier,
  treasuryRebalancer,
});
treasuryRebalancer.setAlertService(alertService);

const app = express();

app.use(ipFilterMiddleware);
app.use(express.json());
app.use(soc2RequestLogger);

app.use((_req, res, next) => {
  res.setHeader("X-Fluid-Region", DEFAULT_REGION);
  next();
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/docs.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Responsible disclosure (RFC 9116)
app.get("/.well-known/security.txt", securityTxtHandler);
app.get("/security.txt", securityTxtHandler);

const limiterStore = new RedisRateLimitStore(
  redisClient,
  Math.ceil(config.rateLimitWindowMs / 1000),
);

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: {
    error: "Too many requests from this IP, please try again later.",
    code: "RATE_LIMITED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: limiterStore,
});

const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, false);
      return;
    }

    if (
      config.allowedOrigins.length === 0 ||
      config.allowedOrigins.includes(origin)
    ) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS"), false);
  },
  credentials: true,
};

app.use(cors(corsOptions));

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err.message === "Origin not allowed by CORS") {
    return next(new AppError("CORS not allowed", 403, "AUTH_FAILED"));
  }
  next(err);
});

app.get("/badge", (req: Request, res: Response) => {
  void badgeHandler(req, res, config);
});

app.get("/health", (req: Request, res: Response) => {
  const accounts = config.signerPool.getSnapshot().map((account) => ({
    publicKey: account.publicKey,
    status: account.active ? "active" : "inactive",
    in_flight: account.inFlight,
    total_uses: account.totalUses,
    sequence_number: account.sequenceNumber,
    balance: account.balance,
  }));

  res.json({
    status: "ok",
    fee_payers: accounts,
    horizon_nodes:
      getHorizonFailoverClient()?.getNodeStatuses() ??
      getLedgerMonitor()?.getNodeStatuses() ??
      config.horizonUrls.map((url) => ({
        url,
        state: "Active",
        consecutiveFailures: 0,
      })),
    total: accounts.length,
    low_balance_alerting: {
      enabled:
        config.alerting.lowBalanceThresholdXlm !== undefined &&
        alertService.isEnabled() &&
        Boolean(config.horizonUrl),
      threshold_xlm: config.alerting.lowBalanceThresholdXlm ?? null,
      check_interval_ms: config.alerting.checkIntervalMs,
      cooldown_ms: config.alerting.cooldownMs,
      slack_configured: Boolean(config.alerting.slackWebhookUrl),
      email_configured: Boolean(config.alerting.email),
    },
  });
});

// Public status page routes (no authentication required)
app.get("/status", (req: Request, res: Response, next: NextFunction) => {
  void statusPageHandler(req, res, next, config);
});

app.get("/status/uptime", (req: Request, res: Response, next: NextFunction) => {
  void uptimeHandler(req, res, next, config);
});

app.get(
  "/status/incidents",
  (req: Request, res: Response, next: NextFunction) => {
    void incidentsHandler(req, res, next, config);
  },
);

app.post(
  "/status/subscribe",
  (req: Request, res: Response, next: NextFunction) => {
    void subscribeHandler(req, res, next);
  },
);

app.post(
  "/status/unsubscribe",
  (req: Request, res: Response, next: NextFunction) => {
    void unsubscribeHandler(req, res, next);
  },
);


// Fee bump endpoint
app.post(
  "/fee-bump",
  apiKeyMiddleware,
  apiKeyRateLimit,
  tenantTierTxLimit,
  limiter,
  (req: Request, res: Response, next: NextFunction) => {
    void feeBumpHandler(req, res, next, config);
  },
);

app.post(
  "/fee-bump/batch",
  apiKeyMiddleware,
  apiKeyRateLimit,
  tenantTierTxLimit,
  limiter,
  (req: Request, res: Response, next: NextFunction) => {
    feeBumpBatchHandler(req, res, next, config);
  },
);

app.delete("/tenant", apiKeyMiddleware, (req: Request, res: Response, next: NextFunction) => {
  void deleteCurrentTenantHandler(req, res, next);
});


app.post(
  "/test/alerts/low-balance",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!alertService.isEnabled()) {
        return res.status(400).json({
          error:
            "No alert transport configured. Set Slack webhook or SMTP env vars first.",
        });
      }

      await alertService.sendTestAlert(config);
      res.json({ message: "Test low-balance alert sent" });
    } catch (error) {
      next(error);
    }
  },
);

app.post("/admin/auth/login", adminLoginHandler);
app.post("/admin/auth/change-password", requireAuthenticatedAdmin(), changeAdminPasswordHandler);
app.get("/admin/users", requirePermission("manage_users"), listAdminUsersHandler);
app.post("/admin/users", requirePermission("manage_users"), createAdminUserHandler);
app.patch("/admin/users/:id/role", requirePermission("manage_users"), updateAdminUserRoleHandler);
app.delete("/admin/users/:id", requirePermission("manage_users"), deactivateAdminUserHandler);

app.get("/admin/api-keys", requirePermission("view_api_keys"), listApiKeysHandler);
app.post("/admin/api-keys", requirePermission("manage_api_keys"), upsertApiKeyHandler);
app.patch("/admin/api-keys/:key/revoke", requirePermission("manage_api_keys"), revokeApiKeyHandler);
app.patch("/admin/api-keys/:key/chains", requirePermission("manage_api_keys"), updateApiKeyChainsHandler);
app.delete("/admin/api-keys/:key", requirePermission("manage_api_keys"), revokeApiKeyHandler);

app.get("/admin/subscription-tiers", requirePermission("view_tenants"), listSubscriptionTiersHandler);
app.patch(
  "/admin/tenants/:tenantId/subscription-tier",
  requirePermission("manage_tenants"),
  updateTenantSubscriptionTierHandler,
);
app.delete("/admin/tenants/:tenantId", (req: Request, res: Response, next: NextFunction) => {
  void deleteTenantByAdminHandler(req, res, next);
});

app.get("/admin/signers", requirePermission("view_signers"), listSignersHandler(config));
app.post("/admin/signers", requirePermission("manage_signers"), addSignerHandler(config));
app.delete("/admin/signers/:publicKey", requirePermission("manage_signers"), removeSignerHandler(config));

app.get("/admin/prices", getPriceHandler);
app.get("/admin/transactions", requirePermission("view_transactions"), listTransactionsHandler);
app.get("/admin/analytics/spend-forecast", requirePermission("view_analytics"), getSpendForecastHandler(config));
app.get("/admin/fee-multiplier", requirePermission("manage_config"), getFeeMultiplierHandler);
app.get("/admin/multi-chain/stats", requirePermission("view_analytics"), getMultiChainStatsHandler(config));
app.get("/admin/device-tokens", requirePermission("view_api_keys"), listDeviceTokensHandler);
app.post("/admin/device-tokens", requirePermission("manage_api_keys"), registerDeviceTokenHandler);
app.delete("/admin/device-tokens/:id", requirePermission("manage_api_keys"), deleteDeviceTokenHandler);
app.get("/admin/webhooks/dlq", requirePermission("view_transactions"), listDlqHandler);
app.post("/admin/webhooks/dlq/replay", requirePermission("manage_config"), replayDlqHandler);
app.post("/admin/webhooks/dlq/delete", requirePermission("manage_config"), deleteDlqHandler);
app.get("/admin/audit-log/export", requirePermission("view_audit_logs"), exportAuditLogHandler);


// Notification centre routes (SSE must be registered before /:id/read)
app.get("/admin/notifications/sse", (req: Request, res: Response) =>
  notificationSseHandler(req, res),
);
app.get("/admin/notifications", (req: Request, res: Response) => {
  void listNotificationsHandler(req, res);
});
app.post("/admin/notifications", (req: Request, res: Response) => {
  void createNotificationHandler(req, res);
});
app.patch("/admin/notifications/read-all", (req: Request, res: Response) => {
  void markAllReadHandler(req, res);
});
app.patch("/admin/notifications/:id/read", (req: Request, res: Response) => {
  void markReadHandler(req, res);
});

app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);
app.post("/create-checkout-session", createCheckoutSessionHandler);
app.post("/estimate", limiter, estimateFeeHandler(config));

// Daily digest
app.get("/admin/digest/unsubscribe", digestUnsubscribeHandler);
app.post("/admin/digest/unsubscribe", digestUnsubscribeHandler);
app.post("/admin/digest/send-now", sendDigestNowHandler);

// Audit logs
app.get("/admin/audit-logs", (req: Request, res: Response) => {
  void listAuditLogsHandler(req, res);
});

// Intelligent rate limiting admin routes
app.get("/admin/rate-limit/candidates", (req: Request, res: Response) => {
  void (async () => {
    const { getUpgradeCandidatesHandler } = await import(
      "./handlers/adminRateLimit"
    );
    getUpgradeCandidatesHandler(req, res);
  })();
});
app.post("/admin/rate-limit/adjust", (req: Request, res: Response) => {
  void (async () => {
    const { adminTierAdjustmentHandler } = await import(
      "./handlers/adminRateLimit"
    );
    adminTierAdjustmentHandler(req, res);
  })();
});
app.get("/admin/rate-limit/usage/:tenantId", (req: Request, res: Response) => {
  void (async () => {
    const { getTenantUsageHandler } = await import("./handlers/adminRateLimit");
    getTenantUsageHandler(req, res);
  })();
});
app.get("/admin/rate-limit/adjustments", (req: Request, res: Response) => {
  void (async () => {
    const { getTierAdjustmentsHandler } = await import(
      "./handlers/adminRateLimit"
    );
    getTierAdjustmentsHandler(req, res);
  })();
});
app.post("/admin/rate-limit/manual-score", (req: Request, res: Response) => {
  void (async () => {
    const { triggerManualScoringHandler } = await import(
      "./handlers/adminRateLimit"
    );
    triggerManualScoringHandler(req, res);
  })();
});

app.get("/admin/chains", (req: Request, res: Response) => {
  void listChainsHandler(req, res);
});
app.post("/admin/chains", (req: Request, res: Response) => {
  void createChainHandler(req, res);
});
app.patch("/admin/chains/:id", (req: Request, res: Response) => {
  void updateChainHandler(req, res);
});
app.delete("/admin/chains/:id", (req: Request, res: Response) => {
  void deleteChainHandler(req, res);
});


app.get("/admin/sar/stats", (req: Request, res: Response) => {
  void getSARStatsHandler(req, res);
});
app.get("/admin/sar/export", (req: Request, res: Response) => {
  void exportSARReportsHandler(req, res);
});
app.get("/admin/sar", (req: Request, res: Response) => {
  void listSARReportsHandler(req, res);
});
app.get("/admin/sar/:id", (req: Request, res: Response) => {
  void getSARReportHandler(req, res);
});
app.patch("/admin/sar/:id/review", (req: Request, res: Response) => {
  void reviewSARReportHandler(req, res);
});

app.use(notFoundHandler);
app.use(createGlobalErrorHandler(slackNotifier));

const PORT = process.env.PORT || 3000;

let ledgerMonitor: ReturnType<typeof initializeLedgerMonitor> | null = null;
let balanceMonitor: ReturnType<typeof initializeBalanceMonitor> | null = null;
let incidentMonitor: ReturnType<typeof initializeIncidentMonitor> | null = null;
let treasurySweeper: ReturnType<typeof initializeTreasurySweeper> | null = null;
let digestWorker: ReturnType<typeof initializeDigestWorker> | null = null;
let tenantErasureWorker: TenantErasureWorker | null = null;
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
  incidentMonitor?.stop();
  digestWorker?.stop();
  tenantErasureWorker?.stop();
  feeManager.stop();
  stopChainRegistryHotReload();
  stopOFACScreening();
  treasurySweeper?.stop();

  if (server) {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
    return;
  }

  process.exit(0);
}

// --- Background Workers ---
let ledgerMonitorInstance: any = null;
if (config.horizonUrls.length > 0) {
  try {
    ledgerMonitorInstance = initializeLedgerMonitor(config);
    ledgerMonitorInstance.start();
    logger.info("Ledger monitor worker started");
  } catch (error) {
    logger.error(
      { ...serializeError(error) },
      "Failed to start ledger monitor",
    );
  }
} else {
  logger.info("No Horizon URLs configured; ledger monitor disabled");
}

if (
  config.horizonUrl &&
  config.alerting.lowBalanceThresholdXlm !== undefined &&
  alertService.isEnabled()
) {
  try {
    balanceMonitor = initializeBalanceMonitor(config, alertService);
    balanceMonitor.start();
    logger.info("Balance monitor worker started");
  } catch (error) {
    logger.error(
      { ...serializeError(error) },
      "Failed to start balance monitor",
    );
  }
} else {
  logger.info(
    "Low balance alerting disabled - missing Horizon URL, threshold, or alert transport",
  );
}

if (pagerDutyNotifier.isConfigured() || fcmNotifier.isConfigured()) {
  try {
    incidentMonitor = initializeIncidentMonitor(
      config,
      pagerDutyNotifier,
      {},
      fcmNotifier,
    );
    incidentMonitor.start();
    logger.info("Incident monitor worker started");
  } catch (error) {
    logger.error(
      { ...serializeError(error) },
      "Failed to start incident monitor",
    );
  }
} else {
  logger.info("PagerDuty incident alerting disabled - routing key not set");
}

try {
  const treasuryRefill = initializeTreasuryRefill(config);
  if (treasuryRefill) {
    treasuryRefill.start();
    logger.info("Treasury refill worker started");
  }
} catch (error) {
  logger.error(
    { ...serializeError(error) },
    "Failed to start treasury refill worker",
  );
}

// Initialize status monitor service
let statusMonitor: StatusMonitorService | null = null;
try {
  statusMonitor = new StatusMonitorService(prisma, config);
  statusMonitor.start();
  logger.info("Status monitor worker started");
} catch (error) {
  logger.error(
    { ...serializeError(error) },
    "Failed to start status monitor worker",
  );
}

// Daily email digest worker
try {
  digestWorker = initializeDigestWorker();
  if (digestWorker) {
    digestWorker.start();
    logger.info("Daily digest worker started");
  }
} catch (error) {
  logger.error(
    { ...serializeError(error) },
    "Failed to start daily digest worker",
  );
}

try {
  tenantErasureWorker = initializeTenantErasureWorker();
  tenantErasureWorker.start();
  logger.info("Tenant erasure worker started");
} catch (error) {
  logger.error(
    { ...serializeError(error) },
    "Failed to start tenant erasure worker",
  );
}

// Audit log AI summary worker
try {
  startAuditSummaryWorker();
  logger.info("Audit summary worker started");
} catch (error) {
  logger.error(
    { ...serializeError(error) },
    "Failed to start audit summary worker",
  );
}

// Daily scoring worker for intelligent rate limiting
try {
  dailyScoringWorker.start();
  logger.info("Daily scoring worker started");
} catch (error) {
  logger.error(
    { ...serializeError(error) },
    "Failed to start daily scoring worker",
  );
}

// Treasury automated sweeper (Cold storage)
try {
  treasurySweeper = initializeTreasurySweeper(config);
  treasurySweeper.start();
  logger.info("Treasury sweeper worker started");
} catch (error) {
  logger.error(
    { ...serializeError(error) },
    "Failed to start treasury sweeper worker",
  );
}

server = app.listen(PORT, () => {
  logger.info(
    {
      fee_payers_loaded: config.feePayerAccounts.length,
      fee_payer_public_keys: config.feePayerAccounts.map(
        (account) => account.publicKey,
      ),
      horizon_node_count: config.horizonUrls.length,
      horizon_nodes: config.horizonUrls,
      horizon_selection_strategy: config.horizonSelectionStrategy,
      port: PORT,
      url: `http://0.0.0.0:${PORT}`,
    },
    "Fluid server started",
  );
});
