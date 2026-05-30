use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use stellar_strkey::{ed25519, Strkey};
use tokio::sync::Mutex;

use crate::{config::Config, error::AppError, horizon::HorizonCluster, metrics::AppMetrics};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub global_limiter: Arc<RateLimiter>,
    pub horizon: Arc<HorizonCluster>,
    pub metrics: Arc<AppMetrics>,
    pub quota_ledger: Arc<Mutex<Vec<SponsoredTransactionRecord>>>,
    pub signer_pool: Arc<SignerPool>,
    pub transaction_store: Arc<Mutex<HashMap<String, TransactionRecord>>>,
    pub api_key_limiter: Arc<Mutex<HashMap<String, RateLimitEntry>>>,
}

#[derive(Clone)]
pub struct ApiKeyConfig {
    pub daily_quota_stroops: i64,
    pub key: &'static str,
    pub max_requests: u32,
    #[allow(dead_code)]
    pub name: &'static str,
    pub tenant_id: &'static str,
    pub tier: &'static str,
    pub window_ms: u64,
}

pub const API_KEYS: [ApiKeyConfig; 2] = [
    ApiKeyConfig {
        daily_quota_stroops: 200,
        key: "fluid-free-demo-key",
        max_requests: 2,
        name: "Demo Free dApp",
        tenant_id: "tenant-demo-free",
        tier: "free",
        window_ms: 60_000,
    },
    ApiKeyConfig {
        daily_quota_stroops: 2_000,
        key: "fluid-pro-demo-key",
        max_requests: 5,
        name: "Demo Pro dApp",
        tenant_id: "tenant-demo-pro",
        tier: "pro",
        window_ms: 60_000,
    },
];

#[derive(Clone)]
pub struct SignerAccount {
    pub active: bool,
    pub balance_stroops: Option<u64>,
    pub consecutive_failures: u32,
    pub public_key: String,
    pub public_key_bytes: [u8; 32],
    pub secret: String,
    pub total_uses: u64,
    pub in_flight: u32,
}

pub const FAILURE_THRESHOLD: u32 = 3;
pub const REVALIDATION_INTERVAL_SECS: u64 = 30;

#[derive(Clone)]
pub struct SignerPool {
    inner: Arc<Mutex<Vec<SignerAccount>>>,
}

pub struct SignerLease {
    pub account: SignerAccount,
    pub index: usize,
    pool: Arc<Mutex<Vec<SignerAccount>>>,
}

#[derive(Clone, Serialize)]
pub struct HealthFeePayer {
    pub balance: Option<String>,
    pub consecutive_failures: u32,
    pub in_flight: u32,
    #[serde(rename = "publicKey")]
    pub public_key: String,
    pub sequence_number: Option<String>,
    pub status: &'static str,
    pub total_uses: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TransactionRecord {
    pub created_at: String,
    pub hash: String,
    pub status: String,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct SponsoredTransactionRecord {
    pub created_at_ms: u128,
    pub fee_stroops: i64,
    pub tenant_id: String,
}

#[derive(Clone)]
pub struct RateLimiter {
    entries: Arc<Mutex<HashMap<String, RateLimitEntry>>>,
    max: u32,
    window_ms: u64,
}

#[derive(Clone)]
pub struct RateLimitEntry {
    pub count: u32,
    pub reset_time_ms: u128,
}

pub struct RateLimitResult {
    pub limit: u32,
    pub remaining: u32,
    pub reset_time_epoch_seconds: u64,
}

impl AppState {
    pub fn new(config: Config, secrets: &[String]) -> Result<Self, AppError> {
        let config = Arc::new(config);
        Ok(Self {
            api_key_limiter: Arc::new(Mutex::new(HashMap::new())),
            config: Arc::clone(&config),
            global_limiter: Arc::new(RateLimiter::new(
                config.global_rate_limit_max,
                config.global_rate_limit_window_ms,
            )),
            horizon: Arc::new(HorizonCluster::new(
                &config.horizon_urls,
                config.horizon_selection_strategy,
            )),
            metrics: Arc::new(AppMetrics::new(
                std::env::var("FLUID_AVAILABLE_ACCOUNT_BALANCE")
                    .ok()
                    .and_then(|value| value.parse::<f64>().ok())
                    .unwrap_or(0.0),
            )),
            quota_ledger: Arc::new(Mutex::new(Vec::new())),
            signer_pool: Arc::new(SignerPool::new(secrets)?),
            transaction_store: Arc::new(Mutex::new(HashMap::new())),
        })
    }
}

impl SignerPool {
    pub fn new(secrets: &[String]) -> Result<Self, AppError> {
        if secrets.is_empty() {
            return Err(AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "SignerPool requires at least one account",
            ));
        }

        let mut accounts = Vec::with_capacity(secrets.len());
        for secret in secrets {
            let (public_key_bytes, public_key) = decode_secret(secret)?;
            accounts.push(SignerAccount {
                active: true,
                balance_stroops: None,
                consecutive_failures: 0,
                public_key,
                public_key_bytes,
                secret: secret.clone(),
                total_uses: 0,
                in_flight: 0,
            });
        }

        Ok(Self {
            inner: Arc::new(Mutex::new(accounts)),
        })
    }

    pub async fn acquire(&self) -> Result<SignerLease, AppError> {
        let mut guard = self.inner.lock().await;
        // Prioritize accounts with highest balance; fall back to fewest in-flight
        let (index, account) = guard
            .iter_mut()
            .enumerate()
            .filter(|(_, account)| account.active)
            .max_by_key(|(_, account)| {
                (
                    account.balance_stroops.unwrap_or(0),
                    u32::MAX - account.in_flight,
                )
            })
            .ok_or_else(|| {
                AppError::new(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "INTERNAL_ERROR",
                    "No active signer accounts are available",
                )
            })?;

        account.in_flight += 1;
        account.total_uses += 1;

        Ok(SignerLease {
            account: account.clone(),
            index,
            pool: Arc::clone(&self.inner),
        })
    }

    /// Record a successful transaction for the account at `index`.
    pub async fn report_success(&self, index: usize) {
        let mut guard = self.inner.lock().await;
        if let Some(account) = guard.get_mut(index) {
            account.consecutive_failures = 0;
        }
    }

    /// Record a failure for the account at `index`.
    /// After FAILURE_THRESHOLD consecutive failures the account is marked inactive.
    pub async fn report_failure(&self, index: usize, reason: &str) {
        let mut guard = self.inner.lock().await;
        if let Some(account) = guard.get_mut(index) {
            account.consecutive_failures += 1;
            if account.consecutive_failures >= FAILURE_THRESHOLD && account.active {
                account.active = false;
                tracing::warn!(
                    "[LoadBalancer] Account {} deactivated after {} consecutive failures. Last reason: {}",
                    account.public_key,
                    account.consecutive_failures,
                    reason
                );
            }
        }
    }

    /// Periodically re-enable inactive accounts and refresh balances via Horizon.
    /// Accounts with higher balances are naturally preferred by `acquire`.
    pub async fn revalidate(&self, horizon_url: &str, client: &reqwest::Client) {
        let snapshots: Vec<(usize, String, bool)> = {
            let guard = self.inner.lock().await;
            guard
                .iter()
                .enumerate()
                .map(|(i, a)| (i, a.public_key.clone(), a.active))
                .collect()
        };

        for (index, public_key, was_active) in snapshots {
            let url = format!(
                "{}/accounts/{}",
                horizon_url.trim_end_matches('/'),
                public_key
            );
            match client.get(&url).send().await {
                Ok(response) if response.status().is_success() => {
                    #[derive(serde::Deserialize)]
                    struct AccountResponse {
                        balances: Vec<Balance>,
                    }
                    #[derive(serde::Deserialize)]
                    struct Balance {
                        asset_type: String,
                        balance: String,
                    }

                    if let Ok(body) = response.json::<AccountResponse>().await {
                        let xlm_stroops = body
                            .balances
                            .iter()
                            .find(|b| b.asset_type == "native")
                            .and_then(|b| b.balance.parse::<f64>().ok())
                            .map(|xlm| (xlm * 10_000_000.0) as u64);

                        let mut guard = self.inner.lock().await;
                        if let Some(account) = guard.get_mut(index) {
                            account.balance_stroops = xlm_stroops;
                            if !was_active {
                                account.active = true;
                                account.consecutive_failures = 0;
                                tracing::info!(
                                    "[LoadBalancer] Account {} re-enabled. Balance: {} stroops",
                                    account.public_key,
                                    xlm_stroops.unwrap_or(0)
                                );
                            }
                        }
                    }
                }
                Ok(response) => {
                    tracing::warn!(
                        "[LoadBalancer] Revalidation fetch for {} returned HTTP {}",
                        public_key,
                        response.status()
                    );
                }
                Err(err) => {
                    tracing::warn!(
                        "[LoadBalancer] Revalidation fetch for {} failed: {}",
                        public_key,
                        err
                    );
                }
            }
        }
    }

    pub async fn snapshot(&self) -> Vec<HealthFeePayer> {
        let guard = self.inner.lock().await;
        guard
            .iter()
            .map(|account| HealthFeePayer {
                balance: account
                    .balance_stroops
                    .map(|s| format!("{:.7}", s as f64 / 10_000_000.0)),
                consecutive_failures: account.consecutive_failures,
                in_flight: account.in_flight,
                public_key: account.public_key.clone(),
                sequence_number: None,
                status: if account.active { "active" } else { "inactive" },
                total_uses: account.total_uses,
            })
            .collect()
    }
}

impl SignerLease {
    pub async fn release(self) {
        let mut guard = self.pool.lock().await;
        if let Some(account) = guard.get_mut(self.index) {
            account.in_flight = account.in_flight.saturating_sub(1);
        }
    }
}

impl RateLimiter {
    pub fn new(max: u32, window_ms: u64) -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            max,
            window_ms,
        }
    }

    pub async fn check(&self, key: &str) -> Result<RateLimitResult, AppError> {
        let mut guard = self.entries.lock().await;
        let now_ms = now_ms();
        let entry = guard
            .entry(key.to_string())
            .or_insert_with(|| RateLimitEntry {
                count: 0,
                reset_time_ms: now_ms + u128::from(self.window_ms),
            });

        if now_ms >= entry.reset_time_ms {
            entry.count = 0;
            entry.reset_time_ms = now_ms + u128::from(self.window_ms);
        }

        if entry.count >= self.max {
            return Err(AppError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMITED",
                "Too many requests from this IP, please try again later.",
            ));
        }

        entry.count += 1;

        Ok(RateLimitResult {
            limit: self.max,
            remaining: self.max.saturating_sub(entry.count),
            reset_time_epoch_seconds: (entry.reset_time_ms / 1_000) as u64,
        })
    }
}

fn decode_secret(secret: &str) -> Result<([u8; 32], String), AppError> {
    let secret = match Strkey::from_string(secret).map_err(|error| {
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            format!("Failed to parse fee payer secret: {error}"),
        )
    })? {
        Strkey::PrivateKeyEd25519(private_key) => private_key,
        _ => {
            return Err(AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Expected a Stellar ed25519 private key",
            ))
        }
    };

    let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret.0);
    let public_key_bytes = signing_key.verifying_key().to_bytes();
    let public_key = format!(
        "{}",
        Strkey::PublicKeyEd25519(ed25519::PublicKey(public_key_bytes))
    );

    Ok((public_key_bytes, public_key.to_string()))
}

pub fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis()
}

pub fn iso_now() -> String {
    format!("{}", now_ms())
}

pub fn utc_day_start_ms() -> u128 {
    let now = now_ms() / 1_000;
    let days = now / 86_400;
    u128::from(days * 86_400 * 1_000)
}
