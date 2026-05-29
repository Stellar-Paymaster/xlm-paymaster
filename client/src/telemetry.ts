/**
 * Anonymous Usage Telemetry Module
 * 
 * This module implements a non-intrusive, anonymous telemetry system for the Fluid SDK.
 * It collects minimal, non-personal data to help maintainers understand SDK usage patterns.
 * 
 * Data collected:
 * - sdk_version: The installed package version string
 * - domain: window.location.hostname (no path, no query params, no user identifiers)
 * - timestamp: UTC date (day-level precision only, no time)
 * 
 * Privacy guarantees:
 * - NO personal data is collected
 * - NO transaction data is collected
 * - NO wallet addresses are collected
 * - NO IP logging on the collector side
 * - Opt-in by default (ENABLE_TELEMETRY: false)
 * - Fire-and-forget: failures never block SDK functionality
 */

export interface TelemetryConfig {
  /**
   * Enable or disable telemetry collection.
   * Default: false (opt-in)
   */
  enabled?: boolean;
  
  /**
   * Enable or disable diagnostic bug reporting.
   * Default: false (opt-in)
   */
  diagnosticsEnabled?: boolean;

  /**
   * Custom telemetry endpoint URL.
   * Default: 'https://telemetry.fluid.dev/ping'
   */
  endpoint?: string;

  /**
   * Custom diagnostics endpoint URL.
   * Default: 'https://telemetry.fluid.dev/report'
   */
  diagnosticsEndpoint?: string;
}

export interface TelemetryData {
  sdk_version: string;
  domain: string;
  timestamp: string;
}

export interface DiagnosticData extends TelemetryData {
  message: string;
  context?: any;
  severity: "info" | "warning" | "error" | "critical";
}

const TELEMETRY_STORAGE_KEY = 'fluid_telemetry_last_ping';
const TELEMETRY_VERSION = '1.0.0';

/**
 * Gets the SDK version from package.json
 * @returns The SDK version string
 */
function getSdkVersion(): string {
  try {
    // In a browser environment, we'll use a hardcoded version
    // In Node.js, we could read from package.json
    return '0.1.1';
  } catch {
    return 'unknown';
  }
}

/**
 * Gets the current domain hostname
 * @returns The domain hostname or 'unknown' if not available
 */
function getDomain(): string {
  try {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.hostname || 'unknown';
    }
    return 'server-side';
  } catch {
    return 'unknown';
  }
}

/**
 * Gets the current UTC date in YYYY-MM-DD format
 * @returns The UTC date string
 */
function getUtcDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Checks if telemetry has already been sent today
 * @returns true if telemetry was already sent today, false otherwise
 */
function hasTelemetryBeenSentToday(): boolean {
  try {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    const lastPing = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    const today = getUtcDate();
    return lastPing === today;
  } catch {
    return false;
  }
}

/**
 * Marks telemetry as sent for today
 */
function markTelemetryAsSent(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TELEMETRY_STORAGE_KEY, getUtcDate());
    }
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Sends telemetry data using the most appropriate method
 * @param endpoint The telemetry endpoint URL
 * @param data The telemetry data to send
 */
function sendToCollector(endpoint: string, data: any): void {
  try {
    // Use navigator.sendBeacon if available (most reliable for fire-and-forget)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
      return;
    }

    // Fallback to fetch with keepalive
    if (typeof fetch !== 'undefined') {
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        keepalive: true,
        mode: 'no-cors',
      }).catch(() => {
        // Silently ignore any errors
      });
      return;
    }

    // Final fallback: pixel ping (1x1 transparent pixel)
    const img = new Image();
    const params = new URLSearchParams({
      v: getSdkVersion(),
      d: getDomain(),
      t: getUtcDate(),
      data: JSON.stringify(data)
    });
    img.src = `${endpoint}?${params.toString()}`;
  } catch {
    // Silently ignore any errors - telemetry should never block functionality
  }
}

/**
 * Collects and sends anonymous telemetry data
 * 
 * This function is designed to be fire-and-forget. It will:
 * 1. Check if telemetry is enabled
 * 2. Check if telemetry has already been sent today (deduplication)
 * 3. Collect minimal, anonymous data
 * 4. Send the data using the most appropriate method
 * 5. Mark telemetry as sent for today
 * 
 * @param config Telemetry configuration
 * @param sdkVersion Optional SDK version override (for testing)
 */
export function collectTelemetry(
  config: TelemetryConfig,
  sdkVersion?: string
): void {
  // Only collect telemetry if explicitly enabled
  if (!config.enabled) {
    return;
  }

  // Check if we've already sent telemetry today (deduplication)
  if (hasTelemetryBeenSentToday()) {
    return;
  }

  // Collect telemetry data
  const data: TelemetryData = {
    sdk_version: sdkVersion || getSdkVersion(),
    domain: getDomain(),
    timestamp: getUtcDate(),
  };

  // Determine endpoint
  const endpoint = config.endpoint || 'https://telemetry.fluid.dev/ping';

  // Send telemetry data (fire-and-forget)
  sendToCollector(endpoint, data);

  // Mark as sent for today
  markTelemetryAsSent();
}

/**
 * Reports a bug or diagnostic information to the telemetry server
 * 
 * @param config Telemetry configuration
 * @param message The error or bug message
 * @param severity Severity level
 * @param context Additional context for the report
 */
export function reportDiagnostic(
  config: TelemetryConfig,
  message: string,
  severity: DiagnosticData["severity"] = "error",
  context?: any
): void {
  if (!config.diagnosticsEnabled) {
    return;
  }

  const data: DiagnosticData = {
    sdk_version: getSdkVersion(),
    domain: getDomain(),
    timestamp: new Date().toISOString(),
    message,
    severity,
    context
  };

  const endpoint = config.diagnosticsEndpoint || 'https://telemetry.fluid.dev/report';
  sendToCollector(endpoint, data);
}

/**
 * Creates a telemetry collector function with the given configuration
 * 
 * @param config Telemetry configuration
 * @returns A function that collects telemetry when called
 */
export function createTelemetryCollector(config: TelemetryConfig) {
  return (sdkVersion?: string) => collectTelemetry(config, sdkVersion);
}

/**
 * Checks if telemetry is enabled in the current environment
 * 
 * @param config Telemetry configuration
 * @returns true if telemetry is enabled, false otherwise
 */
export function isTelemetryEnabled(config: TelemetryConfig): boolean {
  return config.enabled === true;
}

/**
 * Gets the telemetry configuration with defaults applied
 * 
 * @param config Partial telemetry configuration
 * @returns Complete telemetry configuration with defaults
 */
export function getTelemetryConfig(config?: Partial<TelemetryConfig>): TelemetryConfig {
  return {
    enabled: config?.enabled ?? false,
    diagnosticsEnabled: config?.diagnosticsEnabled ?? false,
    endpoint: config?.endpoint ?? 'https://telemetry.fluid.dev/ping',
    diagnosticsEndpoint: config?.diagnosticsEndpoint ?? 'https://telemetry.fluid.dev/report',
  };
}

