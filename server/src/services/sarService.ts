import { prisma } from "../utils/db";
import { createLogger } from "../utils/logger";
import defaultRules from "../config/sar-rules.json";

const logger = createLogger({ component: "sar_service" });

export interface SARRule {
  code: string;
  description: string;
  enabled: boolean;
  windowSeconds?: number;
  threshold?: number;
  thresholdStroops?: number;
}

export interface SARRulesConfig {
  rules: SARRule[];
}

function loadRules(): SARRule[] {
  const envPath = process.env.SAR_RULES_PATH;
  if (envPath) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const custom: SARRulesConfig = require(envPath);
      return custom.rules ?? [];
    } catch (err) {
      logger.warn({ err: String(err), path: envPath }, "Failed to load custom SAR rules, using defaults");
    }
  }
  return (defaultRules as SARRulesConfig).rules;
}

/**
 * Evaluate all enabled SAR rules against a just-recorded transaction.
 * Creates SARReport records for any matched rules. Skips rules already
 * reported for the same (transactionId, ruleCode) pair.
 *
 * Designed to be called fire-and-forget (non-blocking for the fee-bump response).
 */
export async function evaluateSARRules(
  transactionId: string,
  tenantId: string,
  costStroops: number,
  category: string
): Promise<void> {
  const rules = loadRules().filter(r => r.enabled);

  for (const rule of rules) {
    try {
      const matched = await checkRule(rule, transactionId, tenantId, costStroops, category);
      if (matched) {
        await createSARReport(
          transactionId,
          tenantId,
          rule.code,
          matched.reason,
          matched.metadata
        );
        logger.info({ transactionId, tenantId, ruleCode: rule.code }, "SAR rule matched");
      }
    } catch (err) {
      logger.error(
        { transactionId, tenantId, ruleCode: rule.code, err: String(err) },
        "SAR rule evaluation error"
      );
    }
  }
}

interface RuleMatch {
  reason: string;
  metadata: Record<string, unknown>;
}

async function checkRule(
  rule: SARRule,
  transactionId: string,
  tenantId: string,
  costStroops: number,
  category: string
): Promise<RuleMatch | null> {
  switch (rule.code) {
    case "HIGH_FREQUENCY":
      return checkHighFrequency(rule, tenantId);

    case "HIGH_SOROBAN_FEE":
      return checkHighSorobanFee(rule, costStroops, category);

    case "LARGE_FEE_BUMP":
      return checkLargeFee(rule, costStroops);

    default:
      logger.warn({ ruleCode: rule.code }, "Unknown SAR rule code, skipping");
      return null;
  }
}

async function checkHighFrequency(
  rule: SARRule,
  tenantId: string
): Promise<RuleMatch | null> {
  const windowSeconds = rule.windowSeconds ?? 60;
  const threshold = rule.threshold ?? 50;
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  const count = await prisma.transaction.count({
    where: {
      tenantId,
      createdAt: { gte: windowStart }
    }
  });

  if (count > threshold) {
    return {
      reason: `${count} transactions from tenant in ${windowSeconds}s window (threshold: ${threshold})`,
      metadata: { count, windowSeconds, threshold, windowStart: windowStart.toISOString() }
    };
  }
  return null;
}

function checkHighSorobanFee(
  rule: SARRule,
  costStroops: number,
  category: string
): RuleMatch | null {
  const threshold = rule.thresholdStroops ?? 100_000;
  const isSoroban = category.toLowerCase().includes("soroban") ||
    category.toLowerCase().includes("contract");

  if (isSoroban && costStroops > threshold) {
    return {
      reason: `Soroban transaction fee ${costStroops} stroops exceeds threshold ${threshold} stroops`,
      metadata: { costStroops, category, thresholdStroops: threshold }
    };
  }
  return null;
}

function checkLargeFee(
  rule: SARRule,
  costStroops: number
): RuleMatch | null {
  const threshold = rule.thresholdStroops ?? 1_000_000;

  if (costStroops > threshold) {
    return {
      reason: `Fee-bump cost ${costStroops} stroops exceeds threshold ${threshold} stroops (${(costStroops / 10_000_000).toFixed(7)} XLM)`,
      metadata: { costStroops, thresholdStroops: threshold }
    };
  }
  return null;
}

async function createSARReport(
  transactionId: string,
  tenantId: string,
  ruleCode: string,
  reason: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await prisma.sARReport.upsert({
    where: { transactionId_ruleCode: { transactionId, ruleCode } },
    update: {},
    create: {
      transactionId,
      tenantId,
      ruleCode,
      reason,
      metadata: JSON.stringify(metadata),
      status: "pending_review"
    }
  });
}
