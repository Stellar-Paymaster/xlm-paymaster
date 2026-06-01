import { Config, KycConfig } from "../config";
import { AppError } from "../errors/AppError";
import { Tenant } from "../models/tenantStore";
import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "kyc_service" });

export type KycDecisionStatus = "approved" | "denied" | "review" | "unknown";

export interface KycCheckInput {
  tenant: Tenant;
  chainId: string;
  requestId?: string;
  subjectId?: string;
  transactionHash?: string;
}

export interface KycDecision {
  allowed: boolean;
  status: KycDecisionStatus;
  reason?: string;
  providerReference?: string;
}

interface ProviderResponse {
  status?: string;
  approved?: boolean;
  reason?: string;
  providerReference?: string;
  reference?: string;
}

function normalizeProviderResponse(response: ProviderResponse): KycDecision {
  const status =
    typeof response.status === "string"
      ? response.status.trim().toLowerCase()
      : undefined;

  if (response.approved === true || status === "approved" || status === "pass") {
    return {
      allowed: true,
      status: "approved",
      providerReference: response.providerReference ?? response.reference,
      reason: response.reason,
    };
  }

  if (response.approved === false || status === "denied" || status === "blocked") {
    return {
      allowed: false,
      status: "denied",
      providerReference: response.providerReference ?? response.reference,
      reason: response.reason ?? "KYC provider denied sponsorship",
    };
  }

  if (status === "review" || status === "pending") {
    return {
      allowed: false,
      status: "review",
      providerReference: response.providerReference ?? response.reference,
      reason: response.reason ?? "KYC provider requires manual review",
    };
  }

  return {
    allowed: false,
    status: "unknown",
    providerReference: response.providerReference ?? response.reference,
    reason: response.reason ?? "KYC provider returned an unrecognized response",
  };
}

export async function checkKycStatus(
  config: KycConfig,
  input: KycCheckInput,
  fetchImpl: typeof fetch = fetch,
): Promise<KycDecision> {
  if (!config.enabled) {
    return { allowed: true, status: "approved", reason: "KYC hook disabled" };
  }

  if (!config.endpointUrl) {
    return {
      allowed: !config.failClosed,
      status: "unknown",
      reason: "KYC hook is enabled but FLUID_KYC_ENDPOINT_URL is not configured",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpointUrl, {
      body: JSON.stringify({
        chainId: input.chainId,
        requestId: input.requestId,
        subjectId: input.subjectId ?? input.tenant.id,
        tenantId: input.tenant.id,
        tenantName: input.tenant.name,
        transactionHash: input.transactionHash,
      }),
      headers: {
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        allowed: !config.failClosed,
        status: "unknown",
        reason: `KYC provider returned HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as ProviderResponse;
    return normalizeProviderResponse(body);
  } catch (error) {
    logger.warn(
      { ...serializeError(error), tenant_id: input.tenant.id },
      "KYC provider check failed",
    );

    return {
      allowed: !config.failClosed,
      status: "unknown",
      reason:
        error instanceof Error
          ? error.message
          : "KYC provider request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function enforceKycForFeeSponsorship(
  config: Config,
  input: KycCheckInput,
): Promise<KycDecision> {
  const decision = await checkKycStatus(config.kyc, input);
  if (decision.allowed) {
    return decision;
  }

  throw new AppError(
    decision.reason ?? "KYC approval is required before fee sponsorship",
    403,
    decision.status === "review" ? "KYC_REVIEW_REQUIRED" : "KYC_REQUIRED",
  );
}
