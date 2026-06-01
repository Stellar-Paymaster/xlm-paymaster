import { prisma } from "./db";
import { createLogger } from "./logger";

const logger = createLogger({ component: "asyncDbPersist" });

export interface TransactionPersistData {
  id?: string;
  innerTxHash: string;
  tenantId: string | null;
  status: string;
  costStroops: number;
  category: string;
  chain?: string;
}

/**
 * Fire-and-forget DB write. Logs errors but never throws.
 * The caller is NOT blocked by the database insert.
 */
export function persistTransactionAsync(data: TransactionPersistData): void {
  void prisma.transaction
    .create({
      data: {
        ...(data.id !== undefined ? { id: data.id } : {}),
        innerTxHash: data.innerTxHash,
        tenantId: data.tenantId ?? undefined,
        status: data.status,
        costStroops: BigInt(data.costStroops),
        category: data.category,
        ...(data.chain !== undefined ? { chain: data.chain } : {}),
      },
    })
    .catch((err: unknown) => {
      logger.error(
        { err, innerTxHash: data.innerTxHash, tenantId: data.tenantId },
        "asyncDbPersist: failed to persist transaction record",
      );
    });
}

/**
 * Async DB write with exponential-backoff retry logic.
 * Suitable for callers who need a reliability guarantee but can still
 * await off the critical response path.
 */
export async function persistTransactionWithRetry(
  data: TransactionPersistData,
  maxRetries: number = 3,
): Promise<void> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await prisma.transaction.create({
        data: {
          ...(data.id !== undefined ? { id: data.id } : {}),
          innerTxHash: data.innerTxHash,
          tenantId: data.tenantId ?? undefined,
          status: data.status,
          costStroops: BigInt(data.costStroops),
          category: data.category,
          ...(data.chain !== undefined ? { chain: data.chain } : {}),
        },
      });
      return;
    } catch (err: unknown) {
      lastErr = err;

      if (attempt < maxRetries) {
        const delayMs = 100 * Math.pow(2, attempt);
        logger.warn(
          {
            err,
            attempt,
            maxRetries,
            delayMs,
            innerTxHash: data.innerTxHash,
            tenantId: data.tenantId,
          },
          "asyncDbPersist: retrying transaction persist after error",
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  logger.error(
    { err: lastErr, innerTxHash: data.innerTxHash, tenantId: data.tenantId, maxRetries },
    "asyncDbPersist: all retry attempts exhausted for transaction persist",
  );
}
