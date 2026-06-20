//! API gateway rate-limiting configuration helpers (#715)
//!
//! Provides typed tier definitions and validation used by Envoy/NGINX gateway
//! configs to offload basic API key checks and rate limiting from the Rust process.

use std::collections::HashSet;

/// Per-tier rate limit policy applied at the gateway edge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatewayRateLimitTier {
    pub api_key: String,
    pub tenant_id: String,
    pub tier: String,
    pub max_requests: u32,
    pub window_ms: u64,
    pub daily_quota_stroops: i64,
}

/// Gateway configuration derived from environment and built-in demo keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatewayConfig {
    pub global_rate_limit_max: u32,
    pub global_rate_limit_window_ms: u64,
    pub api_key_tiers: Vec<GatewayRateLimitTier>,
    pub trusted_gateway_header: String,
    pub enforce_gateway_auth: bool,
}

impl GatewayConfig {
    /// Load gateway config from environment, falling back to demo API key tiers.
    pub fn from_env() -> Self {
        let global_rate_limit_max = env_parse("PAYMASTER_GATEWAY_GLOBAL_RATE_LIMIT_MAX", 100_u32);
        let global_rate_limit_window_ms =
            env_parse("PAYMASTER_GATEWAY_GLOBAL_RATE_LIMIT_WINDOW_MS", 60_000_u64);
        let trusted_gateway_header = std::env::var("PAYMASTER_GATEWAY_TRUSTED_HEADER")
            .unwrap_or_else(|_| "x-envoy-auth-status".to_string());
        let enforce_gateway_auth =
            env_parse("PAYMASTER_GATEWAY_ENFORCE_AUTH", false);

        Self {
            global_rate_limit_max,
            global_rate_limit_window_ms,
            api_key_tiers: default_api_key_tiers(),
            trusted_gateway_header,
            enforce_gateway_auth,
        }
    }

    /// Validate that tier definitions are internally consistent.
    pub fn validate(&self) -> Result<(), String> {
        if self.global_rate_limit_max == 0 {
            return Err("global_rate_limit_max must be greater than zero".to_string());
        }

        if self.global_rate_limit_window_ms == 0 {
            return Err("global_rate_limit_window_ms must be greater than zero".to_string());
        }

        let mut keys = HashSet::new();
        for tier in &self.api_key_tiers {
            if tier.api_key.trim().is_empty() {
                return Err("api_key must not be empty".to_string());
            }
            if !keys.insert(tier.api_key.clone()) {
                return Err(format!("duplicate api_key tier: {}", tier.api_key));
            }
            if tier.max_requests == 0 {
                return Err(format!(
                    "max_requests must be > 0 for key {}",
                    tier.api_key
                ));
            }
            if tier.window_ms == 0 {
                return Err(format!(
                    "window_ms must be > 0 for key {}",
                    tier.api_key
                ));
            }
        }

        Ok(())
    }

    /// Look up a tier by API key value.
    pub fn find_tier(&self, api_key: &str) -> Option<&GatewayRateLimitTier> {
        self.api_key_tiers.iter().find(|t| t.api_key == api_key)
    }

    /// Returns true when the request should be rejected at the gateway (unknown key).
    pub fn is_api_key_allowed(&self, api_key: &str) -> bool {
        self.find_tier(api_key).is_some()
    }
}

fn default_api_key_tiers() -> Vec<GatewayRateLimitTier> {
    vec![
        GatewayRateLimitTier {
            api_key: "paymaster-free-demo-key".to_string(),
            tenant_id: "tenant-demo-free".to_string(),
            tier: "free".to_string(),
            max_requests: 2,
            window_ms: 60_000,
            daily_quota_stroops: 200,
        },
        GatewayRateLimitTier {
            api_key: "paymaster-pro-demo-key".to_string(),
            tenant_id: "tenant-demo-pro".to_string(),
            tier: "pro".to_string(),
            max_requests: 5,
            window_ms: 60_000,
            daily_quota_stroops: 2_000,
        },
    ]
}

fn env_parse<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_validates() {
        let config = GatewayConfig::from_env();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn finds_demo_api_key_tiers() {
        let config = GatewayConfig::from_env();
        let free = config.find_tier("paymaster-free-demo-key").unwrap();
        assert_eq!(free.max_requests, 2);
        assert_eq!(free.tier, "free");

        let pro = config.find_tier("paymaster-pro-demo-key").unwrap();
        assert_eq!(pro.max_requests, 5);
    }

    #[test]
    fn rejects_unknown_api_keys() {
        let config = GatewayConfig::from_env();
        assert!(!config.is_api_key_allowed("unknown-key"));
        assert!(config.is_api_key_allowed("paymaster-free-demo-key"));
    }

    #[test]
    fn rejects_duplicate_api_keys() {
        let config = GatewayConfig {
            global_rate_limit_max: 10,
            global_rate_limit_window_ms: 60_000,
            api_key_tiers: vec![
                GatewayRateLimitTier {
                    api_key: "dup-key".to_string(),
                    tenant_id: "t1".to_string(),
                    tier: "free".to_string(),
                    max_requests: 2,
                    window_ms: 60_000,
                    daily_quota_stroops: 100,
                },
                GatewayRateLimitTier {
                    api_key: "dup-key".to_string(),
                    tenant_id: "t2".to_string(),
                    tier: "pro".to_string(),
                    max_requests: 5,
                    window_ms: 60_000,
                    daily_quota_stroops: 200,
                },
            ],
            trusted_gateway_header: "x-envoy-auth-status".to_string(),
            enforce_gateway_auth: false,
        };

        assert!(config.validate().is_err());
    }

    #[test]
    fn rejects_zero_global_rate_limit() {
        let config = GatewayConfig {
            global_rate_limit_max: 0,
            global_rate_limit_window_ms: 60_000,
            api_key_tiers: default_api_key_tiers(),
            trusted_gateway_header: "x-envoy-auth-status".to_string(),
            enforce_gateway_auth: false,
        };

        assert!(config.validate().is_err());
    }

    #[test]
    fn tier_rate_limits_match_paymaster_server_defaults() {
        let config = GatewayConfig::from_env();
        let free = config.find_tier("paymaster-free-demo-key").unwrap();
        let pro = config.find_tier("paymaster-pro-demo-key").unwrap();

        // Must stay in sync with paymaster-server/src/state.rs API_KEYS
        assert_eq!(free.max_requests, 2);
        assert_eq!(pro.max_requests, 5);
        assert_eq!(free.window_ms, 60_000);
        assert_eq!(pro.window_ms, 60_000);
    }
}
