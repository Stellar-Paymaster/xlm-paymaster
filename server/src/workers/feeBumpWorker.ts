import { Worker } from "bullmq";
import { Config, pickFeePayerAccount } from "../config";
import { processFeeBump } from "../handlers/feeBump";
import { bullmqConnection } from "../queues/connection";
import {
  FEEBUMP_QUEUE_NAME,
  FeeBumpJobData,
  FeeBumpJobResult,
} from "../queues/feeBumpQueue";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "feeBumpWorker" });

export function initializeFeeBumpWorker(
  config: Config,
): Worker<FeeBumpJobData, FeeBumpJobResult> {
  const concurrency = parseInt(
    process.env.FEEBUMP_QUEUE_CONCURRENCY ?? "5",
    10,
  );

  const worker = new Worker<FeeBumpJobData, FeeBumpJobResult>(
    FEEBUMP_QUEUE_NAME,
    async (job) => {
      const { xdr, submit, tenant, shadowMode } = job.data;
      const feePayerAccount = pickFeePayerAccount(config);
      return processFeeBump(xdr, submit, config, tenant, feePayerAccount, shadowMode);
    },
    { connection: bullmqConnection, concurrency },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, attempt: job?.attemptsMade, err: err.message },
      "Fee-bump job failed",
    );
  });

  logger.info({ concurrency }, "Fee-bump queue worker started");
  return worker;
}
