import { Queue, QueueEvents } from "bullmq";
import { Tenant } from "../models/tenantStore";
import { FeeBumpResponse } from "../handlers/feeBump";
import { bullmqConnection } from "./connection";

export const FEEBUMP_QUEUE_NAME = "fee-bump";

export interface FeeBumpJobData {
  xdr: string;
  submit: boolean;
  tenant: Tenant;
  requestId?: string;
  shadowMode?: boolean;
}

export type FeeBumpJobResult = FeeBumpResponse;

export const feeBumpQueue = new Queue<FeeBumpJobData, FeeBumpJobResult>(
  FEEBUMP_QUEUE_NAME,
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      // 1 original attempt + 5 retries = 6 total, per acceptance criteria
      attempts: 6,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  },
);

export const feeBumpQueueEvents = new QueueEvents(FEEBUMP_QUEUE_NAME, {
  connection: bullmqConnection,
});
