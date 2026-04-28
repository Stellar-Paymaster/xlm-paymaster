import dotenv from "dotenv";

// Load environment variables if present
if (typeof process !== "undefined" && process.env) {
  dotenv.config();
}

export * from "./FluidClient";
export * from "./errors";
export * from "./soroban";
export * from "./flutter";
export {
  collectTelemetry,
  createTelemetryCollector,
  isTelemetryEnabled,
  getTelemetryConfig,
} from "./telemetry";
export type { TelemetryConfig, TelemetryData } from "./telemetry";

export { FluidQueue } from "./queue";
export type { QueuedTransaction, FluidQueueCallbacks } from "./queue";
export {
  buildFeeBumpTransaction,
  createHorizonServer,
  fromTransactionXdr,
  getSdkFamily,
  isTransactionLike,
  resolveStellarSdk,
  toTransactionXdr,
} from "./stellarCompatibility";

export * from "./testUtils/FluidMockClient";
