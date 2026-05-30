import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "fcm_notifier" });

export type FcmAlertType = "low_balance" | "server_down" | "transaction_failure";

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface FcmLowBalancePayload {
  accountPublicKey: string;
  balanceXlm: number;
  thresholdXlm: number;
}

export interface FcmServerDownPayload {
  reason: string;
  detail?: string;
}

export interface FcmTransactionFailurePayload {
  transactionHash: string;
  tenantId: string;
  detail: string;
}

export interface FcmTransactionSuccessPayload {
  transactionHash: string;
  tenantId: string;
  detail: string;
}

export interface FcmNotifierLike {
  isConfigured(): boolean;
  getRegisteredTokens(): Promise<string[]>;
  notifyLowBalance(payload: FcmLowBalancePayload): Promise<number>;
  notifyServerDown(payload: FcmServerDownPayload): Promise<number>;
  notifyTransactionFailure(payload: FcmTransactionFailurePayload): Promise<number>;
  notifyTransactionSuccess(payload: FcmTransactionSuccessPayload): Promise<number>;
}

// Minimal types for firebase-admin messaging to avoid needing type declarations
interface FirebaseApp {
  messaging(): FirebaseMessaging;
}

interface MulticastMessage {
  tokens: string[];
  notification: { title: string; body: string };
  data?: Record<string, string>;
  android?: { priority: "high" | "normal" };
  apns?: { payload: { aps: { sound: string; badge?: number } } };
}

interface BatchResponse {
  successCount: number;
  failureCount: number;
  responses: Array<{ success: boolean; error?: { code?: string; message?: string } }>;
}

interface FirebaseMessaging {
  sendEachForMulticast(message: MulticastMessage): Promise<BatchResponse>;
}

type FirebaseAdminModule = {
  initializeApp(options: {
    credential: { cert(serviceAccount: object): unknown };
  }): FirebaseApp;
  credential: {
    cert(serviceAccount: object): unknown;
  };
  apps: unknown[];
};

// Deep-link paths for each alert type
const DEEP_LINK_PATHS: Record<FcmAlertType | "transaction_success", string> = {
  low_balance: "/admin/dashboard",
  server_down: "/admin/signers",
  transaction_failure: "/admin/transactions",
  transaction_success: "/admin/transactions",
};

export interface FcmNotifierOptions {
  /** Injected DB query for retrieving tokens (used in tests) */
  getTokens?: () => Promise<string[]>;
  /** Injected firebase-admin loader (used in tests) */
  loadFirebaseAdmin?: () => FirebaseAdminModule;
  /** Dashboard base URL for deep links */
  dashboardUrl?: string;
}

export function loadFcmCredentials(
  env: NodeJS.ProcessEnv = process.env,
): FcmCredentials | undefined {
  const projectId = env.FCM_PROJECT_ID?.trim();
  const clientEmail = env.FCM_CLIENT_EMAIL?.trim();
  const privateKey = env.FCM_PRIVATE_KEY?.trim()?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return undefined;
  }

  return { projectId, clientEmail, privateKey };
}

export class FcmNotifier implements FcmNotifierLike {
  private readonly credentials?: FcmCredentials;
  private readonly dashboardUrl?: string;
  private readonly getTokensFn: () => Promise<string[]>;
  private readonly loadAdmin: () => FirebaseAdminModule;
  private firebaseApp: FirebaseApp | null = null;

  constructor(
    credentials: FcmCredentials | undefined,
    options: FcmNotifierOptions = {},
  ) {
    this.credentials = credentials;
    this.dashboardUrl =
      options.dashboardUrl ??
      process.env.FLUID_ALERT_DASHBOARD_URL?.trim() ??
      undefined;
    this.getTokensFn = options.getTokens ?? this.loadTokensFromDb.bind(this);
    this.loadAdmin = options.loadFirebaseAdmin ?? this.requireFirebaseAdmin.bind(this);
  }

  isConfigured(): boolean {
    return Boolean(this.credentials);
  }

  async getRegisteredTokens(): Promise<string[]> {
    return this.getTokensFn();
  }

  async notifyLowBalance(payload: FcmLowBalancePayload): Promise<number> {
    const body =
      `Balance ${payload.balanceXlm.toFixed(2)} XLM is below threshold ` +
      `${payload.thresholdXlm.toFixed(2)} XLM. Top up to keep sponsorship running.`;

    return this.sendToAll("low_balance", {
      title: "Low fee-payer balance",
      body,
      data: {
        type: "low_balance",
        accountPublicKey: payload.accountPublicKey,
        balanceXlm: String(payload.balanceXlm),
        thresholdXlm: String(payload.thresholdXlm),
      },
    });
  }

  async notifyServerDown(payload: FcmServerDownPayload): Promise<number> {
    const body = payload.detail
      ? `${payload.reason}: ${payload.detail}`
      : payload.reason;

    return this.sendToAll("server_down", {
      title: "Fluid server alert",
      body,
      data: {
        type: "server_down",
        reason: payload.reason,
      },
    });
  }

  async notifyTransactionFailure(
    payload: FcmTransactionFailurePayload,
  ): Promise<number> {
    return this.sendToAll("transaction_failure", {
      title: "Transaction failure",
      body: payload.detail,
      data: {
        type: "transaction_failure",
        transactionHash: payload.transactionHash,
        tenantId: payload.tenantId,
      },
    });
  }

  async notifyTransactionSuccess(
    payload: FcmTransactionSuccessPayload,
  ): Promise<number> {
    return this.sendToAll("transaction_success" as any, {
      title: "Transaction success",
      body: payload.detail,
      data: {
        type: "transaction_success",
        transactionHash: payload.transactionHash,
        tenantId: payload.tenantId,
      },
    });
  }

  private async sendToAll(
    alertType: FcmAlertType,
    message: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<number> {
    if (!this.isConfigured()) {
      return 0;
    }

    const tokens = await this.getTokensFn();
    if (tokens.length === 0) {
      logger.info({ alert_type: alertType }, "No device tokens registered; skipping FCM push");
      return 0;
    }

    const deepLinkPath = DEEP_LINK_PATHS[alertType];
    const deepLink = this.dashboardUrl
      ? `${this.dashboardUrl.replace(/\/$/, "")}${deepLinkPath}`
      : deepLinkPath;

    const multicastMessage: MulticastMessage = {
      tokens,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: {
        ...(message.data ?? {}),
        deep_link: deepLink,
        click_action: deepLink,
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    };

    try {
      const app = this.getOrInitApp();
      const result = await app.messaging().sendEachForMulticast(multicastMessage);

      logger.info(
        {
          alert_type: alertType,
          success_count: result.successCount,
          failure_count: result.failureCount,
        },
        "FCM multicast sent",
      );

      result.responses.forEach((resp, index) => {
        if (!resp.success && resp.error) {
          logger.warn(
            {
              token_index: index,
              error_code: resp.error.code,
              error_message: resp.error.message,
            },
            "FCM delivery failed for token",
          );
        }
      });

      return result.successCount;
    } catch (error) {
      logger.error(
        { ...serializeError(error), alert_type: alertType },
        "FCM multicast failed",
      );
      return 0;
    }
  }

  private getOrInitApp(): FirebaseApp {
    if (this.firebaseApp) {
      return this.firebaseApp;
    }

    if (!this.credentials) {
      throw new Error("FCM credentials not configured");
    }

    const admin = this.loadAdmin();

    // Re-use an existing app if one was already initialized (e.g. in tests)
    if (admin.apps.length > 0) {
      this.firebaseApp = admin.apps[0] as FirebaseApp;
      return this.firebaseApp;
    }

    this.firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: this.credentials.projectId,
        clientEmail: this.credentials.clientEmail,
        privateKey: this.credentials.privateKey,
      }),
    });

    return this.firebaseApp;
  }

  private async loadTokensFromDb(): Promise<string[]> {
    try {
      const { default: prisma } = await import("../utils/db");
      const deviceTokenModel = (prisma as any).deviceToken as {
        findMany: (args: any) => Promise<Array<{ token: string }>>;
      };
      const rows = await deviceTokenModel.findMany({
        select: { token: true },
      });
      return rows.map((row) => row.token);
    } catch (error) {
      logger.error({ ...serializeError(error) }, "Failed to load FCM device tokens from DB");
      return [];
    }
  }

  private requireFirebaseAdmin(): FirebaseAdminModule {
    try {
      return require("firebase-admin") as FirebaseAdminModule;
    } catch {
      throw new Error(
        "Push notifications require the 'firebase-admin' package. Run: npm install firebase-admin",
      );
    }
  }
}

let _fcmNotifier: FcmNotifier | null = null;

export function initializeFcmNotifier(options: FcmNotifierOptions = {}): FcmNotifier {
  const credentials = loadFcmCredentials();
  _fcmNotifier = new FcmNotifier(credentials, options);
  return _fcmNotifier;
}

export function getFcmNotifier(): FcmNotifier | null {
  return _fcmNotifier;
}
