use crate::error::AppError;
use axum::http::StatusCode;
use reqwest::Client;
use serde_json::Value;

#[derive(Clone, Copy)]
pub enum HorizonSelectionStrategy {
    Priority,
    RoundRobin,
}

#[derive(Clone)]
pub struct Config {
    pub allowed_origins: Vec<String>,
    pub base_fee: i64,
    pub fee_multiplier: f64,
    pub global_rate_limit_max: u32,
    pub global_rate_limit_window_ms: u64,
    pub horizon_selection_strategy: HorizonSelectionStrategy,
    pub horizon_urls: Vec<String>,
    /// Maximum number of operations allowed inside a single sponsored
    /// transaction envelope. Requests exceeding this limit are rejected
    /// with HTTP 400 before any signing takes place.
    /// Configured via `PAYMASTER_MAX_OPERATIONS_PER_ENVELOPE` (default: 100).
    pub max_operations_per_envelope: usize,
    pub network_passphrase: String,
    pub port: u16,
    pub disable_rate_limits: bool,
}

pub async fn load_config() -> Result<(Config, Vec<String>), AppError> {
    // Attempt to fetch fee payer secrets from Vault when enabled, otherwise
    // fall back to the PAYMASTER_FEE_PAYER_SECRET environment variable.
    let secrets = if std::env::var("VAULT_ENABLED")
        .unwrap_or_default()
        .to_lowercase()
        == "true"
    {
        match fetch_secrets_from_vault().await {
            Ok(s) => s,
            Err(err) => {
                return Err(err);
            }
        }
    } else {
        parse_csv_env("PAYMASTER_FEE_PAYER_SECRET").ok_or_else(|| {
            AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "PAYMASTER_FEE_PAYER_SECRET environment variable is required",
            )
        })?
    };

    let allowed_origins = parse_csv_env("PAYMASTER_ALLOWED_ORIGINS").unwrap_or_default();
    let base_fee = env_parse("PAYMASTER_BASE_FEE", 100_i64);
    let fee_multiplier = env_parse("PAYMASTER_FEE_MULTIPLIER", 2.0_f64);
    let global_rate_limit_max = env_parse("PAYMASTER_RATE_LIMIT_MAX", 5_u32);
    let global_rate_limit_window_ms = env_parse("PAYMASTER_RATE_LIMIT_WINDOW_MS", 60_000_u64);
    let max_operations_per_envelope = env_parse("PAYMASTER_MAX_OPERATIONS_PER_ENVELOPE", 100_usize);
    let configured_horizon_urls = parse_csv_env("STELLAR_HORIZON_URLS").unwrap_or_default();
    let legacy_horizon_url = std::env::var("STELLAR_HORIZON_URL").ok();
    let horizon_urls = if configured_horizon_urls.is_empty() {
        legacy_horizon_url
            .into_iter()
            .filter(|value| !value.trim().is_empty())
            .collect()
    } else {
        configured_horizon_urls
    };
    let horizon_selection_strategy = match std::env::var("PAYMASTER_HORIZON_SELECTION")
        .unwrap_or_else(|_| "priority".to_string())
        .as_str()
    {
        "round_robin" => HorizonSelectionStrategy::RoundRobin,
        _ => HorizonSelectionStrategy::Priority,
    };
    let network_passphrase = std::env::var("STELLAR_NETWORK_PASSPHRASE")
        .unwrap_or_else(|_| "Test SDF Network ; September 2015".to_string());
    let port = env_parse("PORT", 3000_u16);
    let disable_rate_limits = env_parse("PAYMASTER_DISABLE_RATE_LIMITS", false);

    Ok((
        Config {
            allowed_origins,
            base_fee,
            fee_multiplier,
            global_rate_limit_max,
            global_rate_limit_window_ms,
            horizon_selection_strategy,
            horizon_urls,
            max_operations_per_envelope,
            network_passphrase,
            port,
            disable_rate_limits,
        },
        secrets,
    ))
}

async fn fetch_secrets_from_vault() -> Result<Vec<String>, AppError> {
    let addr = std::env::var("VAULT_ADDR").map_err(|_| {
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "VAULT_ERROR",
            "VAULT_ADDR must be set when VAULT_ENABLED=true",
        )
    })?;

    let token = std::env::var("VAULT_TOKEN").map_err(|_| {
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "VAULT_ERROR",
            "VAULT_TOKEN must be set when VAULT_ENABLED=true",
        )
    })?;

    let secret_path = std::env::var("VAULT_SECRET_PATH")
        .unwrap_or_else(|_| "secret/data/paymaster/fee_payer".to_string());
    // Build URL for KV v2 by default. If the user sets a direct path, use it as-is.
    let url = if secret_path.starts_with('/') {
        format!("{}v1{}", addr.trim_end_matches('/'), secret_path)
    } else if secret_path.contains("/data/") || secret_path.contains("/secret/") {
        format!("{}/v1/{}", addr.trim_end_matches('/'), secret_path)
    } else {
        format!(
            "{}/v1/secret/data/{}",
            addr.trim_end_matches('/'),
            secret_path
        )
    };

    let client = Client::new();
    let res = client
        .get(&url)
        .header("X-Vault-Token", token.clone())
        .send()
        .await
        .map_err(|e| {
            AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "VAULT_ERROR",
                format!("Failed to contact Vault at {url}: {e}"),
            )
        })?;

    if !res.status().is_success() {
        return Err(AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "VAULT_ERROR",
            format!("Vault returned HTTP {} when fetching secrets", res.status()),
        ));
    }

    let body: Value = res.json().await.map_err(|e| {
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "VAULT_ERROR",
            format!("Failed to parse Vault response JSON: {e}"),
        )
    })?;

    // KV v2 stores secrets under `data.data`.
    let secret_value = body
        .get("data")
        .and_then(|d| d.get("data"))
        .cloned()
        .unwrap_or_else(|| body.get("data").cloned().unwrap_or(Value::Null));

    let mut secrets = Vec::new();
    match secret_value {
        Value::Object(map) => {
            // Try common keys first, otherwise serialize values to strings.
            if let Some(v) = map.get("PAYMASTER_FEE_PAYER_SECRET") {
                if let Some(s) = v.as_str() {
                    secrets = s
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            } else if let Some(v) = map.get("secret") {
                if let Some(s) = v.as_str() {
                    secrets = s
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            } else {
                for (_k, v) in map.into_iter() {
                    if let Some(s) = v.as_str() {
                        secrets.push(s.to_string());
                    } else {
                        secrets.push(v.to_string());
                    }
                }
            }
        }
        Value::String(s) => {
            secrets = s
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
        _ => {}
    }

    if secrets.is_empty() {
        return Err(AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "VAULT_ERROR",
            "No fee payer secret found in Vault response",
        ));
    }

    // Spawn a background task to periodically renew the Vault token if configured.
    if std::env::var("VAULT_TOKEN").is_ok() {
        let renew_seconds = std::env::var("VAULT_TOKEN_RENEW_SECONDS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(300);
        let addr_clone = addr.clone();
        let token_clone = token.clone();
        tokio::spawn(async move {
            let client = Client::new();
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(renew_seconds)).await;
                let renew_url = format!(
                    "{}/v1/auth/token/renew-self",
                    addr_clone.trim_end_matches('/')
                );
                if let Err(e) = client
                    .post(&renew_url)
                    .header("X-Vault-Token", token_clone.clone())
                    .send()
                    .await
                {
                    tracing::error!("Vault token renewal failed: {}", e);
                } else {
                    tracing::debug!("Vault token renewal attempt completed");
                }
            }
        });
    }

    Ok(secrets)
}

fn env_parse<T>(key: &str, default: T) -> T
where
    T: std::str::FromStr,
{
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn parse_csv_env(key: &str) -> Option<Vec<String>> {
    std::env::var(key).ok().map(|value| {
        value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn unique_key(suffix: &str) -> String {
        format!("PAYMASTER_TEST_{suffix}_{}", uuid::Uuid::new_v4())
    }

    #[test]
    fn parse_csv_env_splits_trims_and_filters() {
        let _lock = ENV_LOCK.lock().unwrap();
        let key = unique_key("CSV");
        std::env::set_var(&key, " a, ,b,  c  ,,");
        let value = parse_csv_env(&key).unwrap();
        assert_eq!(value, vec!["a", "b", "c"]);
        std::env::remove_var(&key);
    }

    #[test]
    fn env_parse_returns_default_on_missing_or_invalid() {
        let _lock = ENV_LOCK.lock().unwrap();
        let missing = unique_key("MISSING");
        let value: u32 = env_parse(&missing, 42);
        assert_eq!(value, 42);

        let invalid = unique_key("INVALID");
        std::env::set_var(&invalid, "not-a-number");
        let value: u32 = env_parse(&invalid, 7);
        assert_eq!(value, 7);
        std::env::remove_var(&invalid);
    }

    #[tokio::test]
    async fn load_config_errors_when_fee_payer_secret_missing() {
        let _lock = ENV_LOCK.lock().unwrap();
        // Ensure the required secret isn't set for this test process.
        std::env::remove_var("PAYMASTER_FEE_PAYER_SECRET");
        match load_config().await {
            Ok(_) => panic!("expected missing secret to error"),
            Err(err) => {
                assert_eq!(err.code, "INTERNAL_ERROR");
                assert_eq!(err.status, StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    #[tokio::test]
    async fn load_config_happy_path_parses_env_and_defaults() {
        let _lock = ENV_LOCK.lock().unwrap();
        // Required
        std::env::set_var("PAYMASTER_FEE_PAYER_SECRET", "test-secret-a");

        // Optional, but set to exercise parsing.
        std::env::set_var(
            "PAYMASTER_ALLOWED_ORIGINS",
            "https://a.example, https://b.example",
        );
        std::env::set_var("PAYMASTER_BASE_FEE", "150");
        std::env::set_var("PAYMASTER_FEE_MULTIPLIER", "1.5");
        std::env::set_var("PAYMASTER_RATE_LIMIT_MAX", "9");
        std::env::set_var("PAYMASTER_RATE_LIMIT_WINDOW_MS", "120000");
        std::env::set_var("STELLAR_NETWORK_PASSPHRASE", "Test Network");
        std::env::set_var("PORT", "4242");

        // Horizon selection: configured list takes priority over legacy var.
        std::env::set_var("STELLAR_HORIZON_URL", "https://legacy.example");
        std::env::set_var(
            "STELLAR_HORIZON_URLS",
            "https://h1.example,https://h2.example",
        );
        std::env::set_var("PAYMASTER_HORIZON_SELECTION", "round_robin");

        let (config, secrets) = load_config().await.expect("expected config to load");
        assert_eq!(secrets.len(), 1);
        assert_eq!(
            config.allowed_origins,
            vec!["https://a.example", "https://b.example"]
        );
        assert_eq!(config.base_fee, 150);
        assert!((config.fee_multiplier - 1.5).abs() < f64::EPSILON);
        assert_eq!(config.global_rate_limit_max, 9);
        assert_eq!(config.global_rate_limit_window_ms, 120_000);
        assert_eq!(config.network_passphrase, "Test Network");
        assert_eq!(config.port, 4242);
        assert_eq!(
            config.horizon_urls,
            vec!["https://h1.example", "https://h2.example"]
        );
        assert!(matches!(
            config.horizon_selection_strategy,
            HorizonSelectionStrategy::RoundRobin
        ));

        std::env::remove_var("PAYMASTER_FEE_PAYER_SECRET");
        std::env::remove_var("PAYMASTER_ALLOWED_ORIGINS");
        std::env::remove_var("PAYMASTER_BASE_FEE");
        std::env::remove_var("PAYMASTER_FEE_MULTIPLIER");
        std::env::remove_var("PAYMASTER_RATE_LIMIT_MAX");
        std::env::remove_var("PAYMASTER_RATE_LIMIT_WINDOW_MS");
        std::env::remove_var("STELLAR_NETWORK_PASSPHRASE");
        std::env::remove_var("PORT");
        std::env::remove_var("STELLAR_HORIZON_URL");
        std::env::remove_var("STELLAR_HORIZON_URLS");
        std::env::remove_var("PAYMASTER_HORIZON_SELECTION");
    }

    #[tokio::test]
    async fn load_config_max_operations_default_and_override() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("PAYMASTER_FEE_PAYER_SECRET", "test-secret-max-ops");

        // Default: 100
        std::env::remove_var("PAYMASTER_MAX_OPERATIONS_PER_ENVELOPE");
        let (config, _) = load_config().await.expect("expected config to load");
        assert_eq!(config.max_operations_per_envelope, 100);

        // Custom value
        std::env::set_var("PAYMASTER_MAX_OPERATIONS_PER_ENVELOPE", "25");
        let (config, _) = load_config().await.expect("expected config to load");
        assert_eq!(config.max_operations_per_envelope, 25);

        std::env::remove_var("PAYMASTER_FEE_PAYER_SECRET");
        std::env::remove_var("PAYMASTER_MAX_OPERATIONS_PER_ENVELOPE");
    }

    #[tokio::test]
    async fn load_config_disable_rate_limits() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("PAYMASTER_FEE_PAYER_SECRET", "test-secret-c");

        // Default: false
        std::env::remove_var("PAYMASTER_DISABLE_RATE_LIMITS");
        let (config, _) = load_config().await.expect("expected config to load");
        assert_eq!(config.disable_rate_limits, false);

        // Custom value: true
        std::env::set_var("PAYMASTER_DISABLE_RATE_LIMITS", "true");
        let (config, _) = load_config().await.expect("expected config to load");
        assert_eq!(config.disable_rate_limits, true);

        std::env::remove_var("PAYMASTER_FEE_PAYER_SECRET");
        std::env::remove_var("PAYMASTER_DISABLE_RATE_LIMITS");
    }

    #[tokio::test]
    async fn load_config_uses_legacy_horizon_url_when_list_empty() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("PAYMASTER_FEE_PAYER_SECRET", "test-secret-b");
        std::env::remove_var("STELLAR_HORIZON_URLS");
        std::env::set_var("STELLAR_HORIZON_URL", "https://legacy.example");
        std::env::set_var("PAYMASTER_HORIZON_SELECTION", "priority");

        let (config, _) = load_config().await.expect("expected config to load");
        assert_eq!(config.horizon_urls, vec!["https://legacy.example"]);
        assert!(matches!(
            config.horizon_selection_strategy,
            HorizonSelectionStrategy::Priority
        ));

        std::env::remove_var("PAYMASTER_FEE_PAYER_SECRET");
        std::env::remove_var("STELLAR_HORIZON_URL");
        std::env::remove_var("PAYMASTER_HORIZON_SELECTION");
    }
}
