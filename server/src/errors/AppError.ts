export type ErrorCode =
  | "MISSING_XDR"
  | "INVALID_XDR"
  | "UNSIGNED_TRANSACTION"
  | "ALREADY_FEE_BUMPED"
  | "SUBMISSION_FAILED"
  | "NOT_FOUND"
  | "AUTH_FAILED"
  | "INTERNAL_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "TOO_MANY_OPERATIONS"
  | "NETWORK_MISMATCH"
  | "QUOTA_EXCEEDED"
  | "SLIPPAGE_TOO_HIGH"
  | "SETTLEMENT_VERIFICATION_FAILED"
  | "UNSUPPORTED_ASSET"
  | "EVM_SETTLEMENT_DISABLED"
  | "UNSUPPORTED_EVM_CHAIN"
  | "UNSUPPORTED_EVM_TOKEN"
  | "VALIDATION_ERROR"
  | "CONFIG_ERROR"
  | "EVM_SPONSOR_FAILED"
  | "SOLANA_SPONSOR_FAILED"
  | "SANCTIONED_ADDRESS";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;

  constructor(message: string, statusCode: number, code: ErrorCode) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }
}
