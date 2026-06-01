import type { CongestionConfig, CongestionLevel } from "../types.ts";

/**
 * Default congestion multipliers by region.
 * These can be overridden via FLUID_CONGESTION_CONFIG environment variable.
 */
const DEFAULT_CONGESTION_CONFIG: CongestionConfig[] = [
  { region: "BR", low: 1.2, medium: 1.4, high: 1.6 },
  { region: "EU", low: 1.1, medium: 1.2, high: 1.3 },
  { region: "APAC", low: 1.3, medium: 1.5, high: 1.8 },
  { region: "US", low: 1.0, medium: 1.1, high: 1.2 },
];

export const GLOBAL_AVERAGE_MULTIPLIER = 1.1;

/**
 * Gets congestion configuration from environment or defaults.
 * @returns Parsed congestion configuration array
 */
export function getCongestionConfig(): CongestionConfig[] {
  const envConfig = process.env.FLUID_CONGESTION_CONFIG?.trim();
  
  if (envConfig) {
    try {
      const parsed = JSON.parse(envConfig) as CongestionConfig[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall back to default on parse error
    }
  }
  
  return DEFAULT_CONGESTION_CONFIG;
}

/**
 * Gets the multiplier for a specific region and congestion level.
 * @param region - Region code
 * @param level - Congestion level
 * @returns The multiplier to apply
 */
export function getCongestionMultiplier(
  region: string,
  level: CongestionLevel
): number {
  const config = getCongestionConfig();
  const regionConfig = config.find(
    (c) => c.region.toUpperCase() === region.toUpperCase()
  );
  
  if (!regionConfig) {
    return GLOBAL_AVERAGE_MULTIPLIER;
  }
  
  return regionConfig[level];
}