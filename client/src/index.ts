import dotenv from "dotenv";

// Load environment variables if present
if (typeof process !== "undefined" && process.env) {
  dotenv.config();
}

export * from "./FluidClient";
export {
  FluidError,
  FluidRequestError,
  FluidNetworkError,
  FluidServerError,
  FluidConfigurationError,
  FluidWalletError,
  FluidNoAvailableServerError,
} from "./errors";
export * from "./soroban";
export * from "./flutter";
export {
  collectTelemetry,
  createTelemetryCollector,
  isTelemetryEnabled,
  getTelemetryConfig,
} from "./telemetry";
export type { TelemetryConfig, TelemetryData } from "./telemetry";
export {
  DEFAULT_GRPC_METHOD_NAMES,
  DEFAULT_GRPC_SERVICE_NAME,
  buildGrpcWebPath,
  decodeFeeBumpBatchResponse,
  decodeFeeBumpBatchRequest,
  decodeFeeBumpRequest,
  decodeFeeBumpResponse,
  decodeGrpcWebFrames,
  encodeFeeBumpBatchRequest,
  encodeFeeBumpBatchResponse,
  encodeFeeBumpRequest,
  encodeFeeBumpResponse,
  encodeGrpcWebFrame,
  encodeGrpcWebTrailers,
  mapGrpcStatusToHttpStatus,
  performGrpcWebUnary,
  GrpcWebTransportError,
} from "./grpcTransport";
export type {
  GrpcFeeBumpBatchRequest,
  GrpcFeeBumpBatchResponse,
  GrpcFeeBumpRequest,
  GrpcFeeBumpResponse,
  GrpcTransportConfig,
  GrpcTransportMethodNames,
  GrpcTransportMode,
  GrpcWebFrameDecodeResult,
  GrpcWebUnaryOptions,
} from "./grpcTransport";

export { FluidQueue } from "./queue";
export type { QueuedTransaction, FluidQueueCallbacks } from "./queue";

export {
  prepareOfflineTransaction,
  getPendingOfflineTransactions,
  removePreparedTransaction,
  clearPreparedTransactions,
  getPendingCount,
  validatePreparedTransaction,
  OFFLINE_TX_STORAGE_KEY,
} from "./offline-tx";
export type { OfflinePreparedTransaction, OfflinePrepareOptions } from "./offline-tx";
// Universal wallet signing (WalletConnect standard bindings, SEP-43 adapters)
export * from "./wallet";
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
export * as ReactNative from "./react-native";
export * from "./context/FluidContext";

