/**
 * Base class for all Paymaster-related errors.
 */
/**
 * Base class for all Paymaster-related errors.
 */
export class PaymasterError extends Error {
  public helpUrl?: string;

  constructor(message: string) {
    super(message);
    this.name = "PaymasterError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, PaymasterError.prototype);
  }
}

/**
 * Base class for all Paymaster request-related errors (network or server).
 */
export class PaymasterRequestError extends PaymasterError {
  public readonly statusCode?: number;
  public readonly serverUrl?: string;

  constructor(message: string, statusCode?: number, serverUrl?: string) {
    super(message);
    this.name = "PaymasterRequestError";
    this.statusCode = statusCode;
    this.serverUrl = serverUrl;
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, PaymasterRequestError.prototype);
  }

  public get status(): number | undefined {
    return this.statusCode;
  }

  public toString(): string {
    const help = this.helpUrl ? ` [Docs: ${this.helpUrl}]` : "";
    return `${this.name}(message=${JSON.stringify(this.message)}, status_code=${this.statusCode}, server_url=${JSON.stringify(this.serverUrl)})${help}`;
  }
}

/**
 * Error thrown when a network request fails (e.g., DNS, timeout, no connectivity).
 */
export class PaymasterNetworkError extends PaymasterRequestError {
  constructor(message: string, serverUrl?: string) {
    super(message, undefined, serverUrl);
    this.name = "PaymasterNetworkError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, PaymasterNetworkError.prototype);
  }
}

/**
 * Error thrown when the Paymaster server returns an error response (4xx or 5xx).
 */
export class PaymasterServerError extends PaymasterRequestError {
  public readonly responseBody?: any;

  constructor(message: string, status: number, serverUrl: string, responseBody?: any) {
    super(message, status, serverUrl);
    this.name = "PaymasterServerError";
    this.responseBody = responseBody;
    
    // Use server-provided error code for more specific help URL if available
    const errorCode = responseBody?.code || responseBody?.error_code;
    this.helpUrl = getHelpUrl(errorCode || this.name);
    
    Object.setPrototypeOf(this, PaymasterServerError.prototype);
  }
}

/**
 * Error thrown when all configured servers are unavailable or exhausted.
 */
export class PaymasterNoAvailableServerError extends PaymasterRequestError {
  constructor(message: string, serverUrl?: string) {
    super(message, undefined, serverUrl);
    this.name = "PaymasterNoAvailableServerError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, PaymasterNoAvailableServerError.prototype);
  }
}

/**
 * Error thrown when the Paymaster client is misconfigured.
 */
export class PaymasterConfigurationError extends PaymasterError {
  constructor(message: string) {
    super(message);
    this.name = "PaymasterConfigurationError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, PaymasterConfigurationError.prototype);
  }
}

/**
 * Error thrown when a required wallet/keypair is missing or operation is rejected by user.
 */
export class PaymasterWalletError extends PaymasterError {
  constructor(message: string) {
    super(message);
    this.name = "PaymasterWalletError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, PaymasterWalletError.prototype);
  }
}

/**
 * Mapping of error names and codes to documentation fragments.
 */
const HELP_BASE_URL = "https://docs.xlm-paymaster.com/errors";

function getHelpUrl(code: string): string {
  const fragment = code
    .replace(/^Paymaster/, "")
    .replace(/Error$/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
    
  return `${HELP_BASE_URL}#${fragment}`;
}
