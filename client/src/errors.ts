/**
 * Base class for all Fluid-related errors.
 */
/**
 * Base class for all Fluid-related errors.
 */
export class FluidError extends Error {
  public helpUrl?: string;

  constructor(message: string) {
    super(message);
    this.name = "FluidError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, FluidError.prototype);
  }
}

/**
 * Base class for all Fluid request-related errors (network or server).
 */
export class FluidRequestError extends FluidError {
  public readonly statusCode?: number;
  public readonly serverUrl?: string;

  constructor(message: string, statusCode?: number, serverUrl?: string) {
    super(message);
    this.name = "FluidRequestError";
    this.statusCode = statusCode;
    this.serverUrl = serverUrl;
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, FluidRequestError.prototype);
  }

  public toString(): string {
    const help = this.helpUrl ? ` [Docs: ${this.helpUrl}]` : "";
    return `${this.name}(message=${JSON.stringify(this.message)}, status_code=${this.statusCode}, server_url=${JSON.stringify(this.serverUrl)})${help}`;
  }
}

/**
 * Error thrown when a network request fails (e.g., DNS, timeout, no connectivity).
 */
export class FluidNetworkError extends FluidRequestError {
  constructor(message: string, serverUrl?: string) {
    super(message, undefined, serverUrl);
    this.name = "FluidNetworkError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, FluidNetworkError.prototype);
  }
}

/**
 * Error thrown when the Fluid server returns an error response (4xx or 5xx).
 */
export class FluidServerError extends FluidRequestError {
  public readonly responseBody?: any;

  constructor(message: string, status: number, serverUrl: string, responseBody?: any) {
    super(message, status, serverUrl);
    this.name = "FluidServerError";
    this.responseBody = responseBody;
    
    // Use server-provided error code for more specific help URL if available
    const errorCode = responseBody?.code || responseBody?.error_code;
    this.helpUrl = getHelpUrl(errorCode || this.name);
    
    Object.setPrototypeOf(this, FluidServerError.prototype);
  }
}

/**
 * Error thrown when all configured servers are unavailable or exhausted.
 */
export class FluidNoAvailableServerError extends FluidRequestError {
  constructor(message: string, serverUrl?: string) {
    super(message, undefined, serverUrl);
    this.name = "FluidNoAvailableServerError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, FluidNoAvailableServerError.prototype);
  }
}

/**
 * Error thrown when the Fluid client is misconfigured.
 */
export class FluidConfigurationError extends FluidError {
  constructor(message: string) {
    super(message);
    this.name = "FluidConfigurationError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, FluidConfigurationError.prototype);
  }
}

/**
 * Error thrown when a required wallet/keypair is missing or operation is rejected by user.
 */
export class FluidWalletError extends FluidError {
  constructor(message: string) {
    super(message);
    this.name = "FluidWalletError";
    this.helpUrl = getHelpUrl(this.name);
    Object.setPrototypeOf(this, FluidWalletError.prototype);
  }
}

/**
 * Mapping of error names and codes to documentation fragments.
 */
const HELP_BASE_URL = "https://docs.fluid.dev/errors";

function getHelpUrl(code: string): string {
  const fragment = code
    .replace(/^Fluid/, "")
    .replace(/Error$/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
    
  return `${HELP_BASE_URL}#${fragment}`;
}
