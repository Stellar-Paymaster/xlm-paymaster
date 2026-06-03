export interface SettingsConfig {
  base_fee: number;
  fee_multiplier: number;
  low_balance_threshold: number;
  rate_limit_per_minute: number;
  max_wallets_per_tenant: number;
  max_tx_per_hour: number;
}

export const DEFAULT_SETTINGS: SettingsConfig = {
  base_fee: 100,
  fee_multiplier: 2,
  low_balance_threshold: 1000,
  rate_limit_per_minute: 60,
  max_wallets_per_tenant: 10,
  max_tx_per_hour: 500,
};

export interface SettingsFieldMeta {
  key: keyof SettingsConfig;
  label: string;
  description: string;
  min: number;
  step: number;
  unit?: string;
}

export const SETTINGS_FIELDS: SettingsFieldMeta[] = [
  {
    key: "base_fee",
    label: "Base Fee",
    description: "Minimum fee in stroops applied to every sponsored transaction.",
    min: 0,
    step: 1,
    unit: "stroops",
  },
  {
    key: "fee_multiplier",
    label: "Fee Multiplier",
    description: "Dynamic scaling factor applied on top of the base fee during congestion.",
    min: 1,
    step: 0.1,
  },
  {
    key: "low_balance_threshold",
    label: "Low Balance Threshold",
    description: "Treasury balance in stroops below which a critical alert is raised.",
    min: 0,
    step: 100,
    unit: "stroops",
  },
  {
    key: "rate_limit_per_minute",
    label: "Rate Limit",
    description: "Maximum requests per minute allowed per API key before throttling.",
    min: 1,
    step: 1,
    unit: "req/min",
  },
  {
    key: "max_wallets_per_tenant",
    label: "Max Wallets per Tenant",
    description: "Upper bound on the number of sponsored wallets a single tenant may register.",
    min: 1,
    step: 1,
  },
  {
    key: "max_tx_per_hour",
    label: "Max Transactions per Hour",
    description: "Hourly transaction cap enforced per tenant to prevent runaway fee consumption.",
    min: 1,
    step: 10,
    unit: "tx/hr",
  },
];

export function validateSettings(data: unknown): data is SettingsConfig {
  if (typeof data !== "object" || data === null) return false;
  const cfg = data as Record<string, unknown>;
  return (
    typeof cfg.base_fee === "number" &&
    cfg.base_fee >= 0 &&
    typeof cfg.fee_multiplier === "number" &&
    cfg.fee_multiplier >= 1 &&
    typeof cfg.low_balance_threshold === "number" &&
    cfg.low_balance_threshold >= 0 &&
    typeof cfg.rate_limit_per_minute === "number" &&
    cfg.rate_limit_per_minute >= 1 &&
    typeof cfg.max_wallets_per_tenant === "number" &&
    cfg.max_wallets_per_tenant >= 1 &&
    typeof cfg.max_tx_per_hour === "number" &&
    cfg.max_tx_per_hour >= 1
  );
}

export function mergeWithDefaults(partial: Partial<SettingsConfig>): SettingsConfig {
  return { ...DEFAULT_SETTINGS, ...partial };
}
