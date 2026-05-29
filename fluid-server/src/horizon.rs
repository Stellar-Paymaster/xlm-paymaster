use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::http::StatusCode;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::info;

use crate::{config::HorizonSelectionStrategy, error::AppError};

#[derive(Clone, Serialize)]
pub struct HorizonNodeStatus {
    pub consecutive_failures: u32,
    pub last_checked_at: Option<String>,
    pub last_error: Option<String>,
    pub last_success_at: Option<String>,
    pub state: &'static str,
    pub url: String,
}

#[derive(Debug)]
pub struct HorizonSubmissionResult {
    pub attempts: usize,
    pub hash: String,
    pub node_url: String,
}

#[derive(Clone, Deserialize)]
#[allow(dead_code)]
pub struct HorizonTransactionResponse {
    pub successful: bool,
}

#[derive(Clone)]
pub struct HorizonCluster {
    client: Client,
    nodes: Arc<Mutex<Vec<HorizonNodeRuntimeState>>>,
    round_robin_cursor: Arc<AtomicUsize>,
    strategy: HorizonSelectionStrategy,
}

#[derive(Clone)]
struct HorizonNodeRuntimeState {
    consecutive_failures: u32,
    last_checked_at: Option<String>,
    last_error: Option<String>,
    last_success_at: Option<String>,
    state: &'static str,
    url: String,
}

#[derive(Deserialize)]
struct HorizonSubmitSuccess {
    hash: String,
}

enum HorizonErrorDisposition {
    Retryable(String),
    Final(String),
}

impl HorizonCluster {
    pub fn new(urls: &[String], strategy: HorizonSelectionStrategy) -> Self {
        let nodes = urls
            .iter()
            .map(|url| HorizonNodeRuntimeState {
                consecutive_failures: 0,
                last_checked_at: None,
                last_error: None,
                last_success_at: None,
                state: "Active",
                url: url.clone(),
            })
            .collect();

        Self {
            client: Client::new(),
            nodes: Arc::new(Mutex::new(nodes)),
            round_robin_cursor: Arc::new(AtomicUsize::new(0)),
            strategy,
        }
    }

    pub async fn statuses(&self) -> Vec<HorizonNodeStatus> {
        let guard = self.nodes.lock().await;
        guard
            .iter()
            .map(|node| HorizonNodeStatus {
                consecutive_failures: node.consecutive_failures,
                last_checked_at: node.last_checked_at.clone(),
                last_error: node.last_error.clone(),
                last_success_at: node.last_success_at.clone(),
                state: node.state,
                url: node.url.clone(),
            })
            .collect()
    }

    pub async fn submit_transaction(
        &self,
        tx_xdr: &str,
    ) -> Result<HorizonSubmissionResult, AppError> {
        let order = self.node_order().await;
        let mut last_error = None;

        for (attempt_index, node_index) in order.iter().enumerate() {
            let node_url = self.node_url(*node_index).await;
            info!(
                "[HorizonFailover] Submit attempt {}/{} via {}",
                attempt_index + 1,
                order.len(),
                node_url
            );

            let response = self
                .client
                .post(format!("{node_url}/transactions"))
                .header("content-type", "application/x-www-form-urlencoded")
                .body(format!("tx={tx_xdr}"))
                .send()
                .await;

            match response {
                Ok(response) if response.status().is_success() => {
                    let body: HorizonSubmitSuccess = response.json().await.map_err(|error| {
                        AppError::new(
                            StatusCode::BAD_GATEWAY,
                            "SUBMISSION_FAILED",
                            format!("Failed to decode Horizon response: {error}"),
                        )
                    })?;
                    self.mark_node_active(*node_index).await;
                    info!(
                        "[HorizonFailover] Submission succeeded on {} with hash {}",
                        node_url, body.hash
                    );

                    return Ok(HorizonSubmissionResult {
                        attempts: attempt_index + 1,
                        hash: body.hash,
                        node_url,
                    });
                }
                Ok(response) => {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    match classify_http_error(status, &body) {
                        HorizonErrorDisposition::Retryable(message) => {
                            self.mark_node_inactive(*node_index, &message).await;
                            info!(
                                "[HorizonFailover] Submission failed on {} (retryable) - {}",
                                node_url, message
                            );
                            last_error = Some(message);
                            continue;
                        }
                        HorizonErrorDisposition::Final(message) => {
                            self.mark_node_checked(*node_index, Some(message.clone()))
                                .await;
                            info!(
                                "[HorizonFailover] Submission failed on {} (final) - {}",
                                node_url, message
                            );
                            return Err(AppError::new(
                                StatusCode::BAD_GATEWAY,
                                "SUBMISSION_FAILED",
                                format!("Transaction submission failed: {message}"),
                            ));
                        }
                    }
                }
                Err(error) => {
                    let message = error.to_string();
                    self.mark_node_inactive(*node_index, &message).await;
                    info!(
                        "[HorizonFailover] Submission failed on {} (retryable) - {}",
                        node_url, message
                    );
                    last_error = Some(message);
                }
            }
        }

        Err(AppError::new(
            StatusCode::BAD_GATEWAY,
            "SUBMISSION_FAILED",
            format!(
                "Transaction submission failed: {}",
                last_error.unwrap_or_else(|| "all Horizon nodes failed".to_string())
            ),
        ))
    }

    #[allow(dead_code)]
    pub async fn get_transaction(
        &self,
        hash: &str,
    ) -> Result<HorizonTransactionResponse, AppError> {
        let order = self.node_order().await;
        let mut last_error = None;

        for node_index in order {
            let node_url = self.node_url(node_index).await;
            let response = self
                .client
                .get(format!("{node_url}/transactions/{hash}"))
                .send()
                .await;

            match response {
                Ok(response) if response.status().is_success() => {
                    let body = response.json().await.map_err(|error| {
                        AppError::new(
                            StatusCode::BAD_GATEWAY,
                            "SUBMISSION_FAILED",
                            format!("Failed to decode Horizon transaction lookup: {error}"),
                        )
                    })?;
                    self.mark_node_active(node_index).await;
                    return Ok(body);
                }
                Ok(response) => {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    match classify_http_error(status, &body) {
                        HorizonErrorDisposition::Retryable(message) => {
                            self.mark_node_inactive(node_index, &message).await;
                            info!(
                                "[HorizonFailover] Transaction lookup failed on {} (retryable) - {}",
                                node_url, message
                            );
                            last_error = Some(message);
                            continue;
                        }
                        HorizonErrorDisposition::Final(message) => {
                            self.mark_node_checked(node_index, Some(message.clone()))
                                .await;
                            return Err(AppError::new(
                                StatusCode::BAD_GATEWAY,
                                "SUBMISSION_FAILED",
                                format!("Transaction lookup failed: {message}"),
                            ));
                        }
                    }
                }
                Err(error) => {
                    let message = error.to_string();
                    self.mark_node_inactive(node_index, &message).await;
                    info!(
                        "[HorizonFailover] Transaction lookup failed on {} (retryable) - {}",
                        node_url, message
                    );
                    last_error = Some(message);
                }
            }
        }

        Err(AppError::new(
            StatusCode::BAD_GATEWAY,
            "SUBMISSION_FAILED",
            format!(
                "Transaction lookup failed: {}",
                last_error.unwrap_or_else(|| "all Horizon nodes failed".to_string())
            ),
        ))
    }

    async fn node_order(&self) -> Vec<usize> {
        let guard = self.nodes.lock().await;
        let mut indexes: Vec<usize> = (0..guard.len()).collect();

        match self.strategy {
            HorizonSelectionStrategy::Priority => {
                indexes.sort_by_key(|index| {
                    if guard[*index].state == "Active" {
                        0
                    } else {
                        1
                    }
                });
            }
            HorizonSelectionStrategy::RoundRobin => {
                if !indexes.is_empty() {
                    let start =
                        self.round_robin_cursor.fetch_add(1, Ordering::Relaxed) % indexes.len();
                    indexes.rotate_left(start);
                }
            }
        }

        indexes
    }

    async fn node_url(&self, node_index: usize) -> String {
        let guard = self.nodes.lock().await;
        guard
            .get(node_index)
            .map(|node| node.url.clone())
            .unwrap_or_default()
    }

    async fn mark_node_active(&self, node_index: usize) {
        let mut guard = self.nodes.lock().await;
        if let Some(node) = guard.get_mut(node_index) {
            node.consecutive_failures = 0;
            node.last_checked_at = Some(iso_now());
            node.last_error = None;
            node.last_success_at = node.last_checked_at.clone();
            node.state = "Active";
            info!("[HorizonFailover] Node {} status => Active", node.url);
        }
    }

    async fn mark_node_inactive(&self, node_index: usize, message: &str) {
        let mut guard = self.nodes.lock().await;
        if let Some(node) = guard.get_mut(node_index) {
            node.consecutive_failures += 1;
            node.last_checked_at = Some(iso_now());
            node.last_error = Some(message.to_string());
            node.state = "Inactive";
            info!("[HorizonFailover] Node {} status => Inactive", node.url);
        }
    }

    async fn mark_node_checked(&self, node_index: usize, message: Option<String>) {
        let mut guard = self.nodes.lock().await;
        if let Some(node) = guard.get_mut(node_index) {
            node.last_checked_at = Some(iso_now());
            node.last_error = message;
        }
    }
}

fn classify_http_error(status: StatusCode, body: &str) -> HorizonErrorDisposition {
    if matches!(status.as_u16(), 408 | 425 | 429 | 500 | 502 | 503 | 504) {
        return HorizonErrorDisposition::Retryable(format!("{status}: {body}"));
    }

    HorizonErrorDisposition::Final(format!("{status}: {body}"))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis()
}

fn iso_now() -> String {
    format!("{}", now_ms())
}

#[cfg(test)]
mod tests {
    use std::sync::Once;

    use axum::{http::StatusCode, response::IntoResponse, routing::post, Json, Router};
    use serde_json::json;

    use super::*;

    static TRACING: Once = Once::new();

    fn init_tracing() {
        TRACING.call_once(|| {
            let _ = tracing_subscriber::fmt()
                .with_test_writer()
                .with_env_filter("info")
                .try_init();
        });
    }

    async fn start_submit_server(
        status: StatusCode,
        body: serde_json::Value,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let app = Router::new().route(
            "/transactions",
            post(move || async move { (status, Json(body.clone())).into_response() }),
        );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let addr = listener.local_addr()?;
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        Ok(format!("http://{}", addr))
    }

    #[tokio::test]
    async fn retries_failed_submission_on_secondary_node_and_logs_statuses(
    ) -> Result<(), Box<dyn std::error::Error>> {
        init_tracing();

        let node_b_url =
            start_submit_server(StatusCode::OK, json!({ "hash": "hash-from-node-b" })).await?;
        let unreachable_node_a = "http://127.0.0.1:9".to_string();
        let cluster = HorizonCluster::new(
            &[unreachable_node_a.clone(), node_b_url.clone()],
            HorizonSelectionStrategy::Priority,
        );

        let result = cluster
            .submit_transaction("AAAA_TEST_XDR")
            .await
            .map_err(|error| error.message)?;
        println!(
            "[Verification] failover submission completed after {} attempts via {} with hash {}",
            result.attempts, result.node_url, result.hash
        );

        assert_eq!(result.attempts, 2);
        assert_eq!(result.node_url, node_b_url);
        assert_eq!(result.hash, "hash-from-node-b");

        let statuses = cluster.statuses().await;
        assert_eq!(statuses[0].url, unreachable_node_a);
        assert_eq!(statuses[0].state, "Inactive");
        assert_eq!(statuses[1].url, node_b_url);
        assert_eq!(statuses[1].state, "Active");

        Ok(())
    }

    #[tokio::test]
    async fn does_not_retry_final_submission_errors() -> Result<(), Box<dyn std::error::Error>> {
        init_tracing();

        let invalid_node_url = start_submit_server(
            StatusCode::UNPROCESSABLE_ENTITY,
            json!({ "detail": "tx_bad_seq" }),
        )
        .await?;
        let secondary_url =
            start_submit_server(StatusCode::OK, json!({ "hash": "should-not-run" })).await?;
        let cluster = HorizonCluster::new(
            &[invalid_node_url.clone(), secondary_url.clone()],
            HorizonSelectionStrategy::Priority,
        );

        let error = cluster
            .submit_transaction("AAAA_BAD_XDR")
            .await
            .expect_err("final Horizon error should stop retries");

        assert!(error.message.contains("422"));
        let statuses = cluster.statuses().await;
        assert_eq!(statuses[0].state, "Active");
        assert_eq!(statuses[1].state, "Active");

        Ok(())
    }
}
