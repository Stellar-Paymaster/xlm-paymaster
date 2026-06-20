/// Local Mock Horizon API Server (Issue #720)
///
/// An in-process HTTP server that simulates the Stellar Horizon API for
/// integration tests.  Supports:
///
///  - Happy-path responses (submit success, account fetch, fee stats)
///  - Slow responses (configurable latency injection)
///  - Network failures (connection reset, TCP stall)
///  - Bad HTTP statuses (429, 500, 502, 503, 504)
///  - Horizon-specific error extras (tx_bad_seq, tx_insufficient_fee, tx_failed)
///  - Per-path scenario overrides
///  - Request capture for assertion in tests
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use serde_json::json;
use tokio::{net::TcpListener, sync::oneshot, time::sleep};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Error scenario to simulate.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HorizonScenario {
    /// Return a successful response.
    Success,
    /// Return HTTP 429 with a `Retry-After: 1` header.
    RateLimit,
    /// Return HTTP 500.
    InternalError,
    /// Return HTTP 502.
    BadGateway,
    /// Return HTTP 503.
    ServiceUnavailable,
    /// Delay the response by `ms` milliseconds, then return 504.
    GatewayTimeout { delay_ms: u64 },
    /// Close the TCP connection immediately without sending a response.
    ConnectionReset,
    /// Return HTTP 400 with Horizon `tx_bad_seq` extras.
    TxBadSeq,
    /// Return HTTP 400 with Horizon `tx_insufficient_fee` extras.
    TxInsufficientFee,
    /// Return HTTP 400 with Horizon `tx_failed` extras.
    TxFailed,
}

/// Configuration for the mock server.
#[derive(Clone, Default)]
pub struct MockHorizonConfig {
    /// Default scenario for all paths not listed in `path_scenarios`.
    pub default_scenario: Option<HorizonScenario>,
    /// Latency added to every response (ms).
    pub latency_ms: u64,
    /// Per-path overrides.  Key is the request path, e.g. `"/transactions"`.
    pub path_scenarios: HashMap<String, HorizonScenario>,
    /// After this many requests the scenario resets to `Success`.
    /// `0` means never reset.
    pub fail_count: usize,
}

/// A captured inbound request.
#[derive(Clone, Debug)]
pub struct CapturedRequest {
    pub method: String,
    pub path: String,
    pub body: String,
}

// ---------------------------------------------------------------------------
// Server state (shared across handlers)
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct ServerState {
    config: Arc<Mutex<MockHorizonConfig>>,
    requests: Arc<Mutex<Vec<CapturedRequest>>>,
    request_count: Arc<AtomicUsize>,
    account_overrides: Arc<Mutex<HashMap<String, serde_json::Value>>>,
}

// ---------------------------------------------------------------------------
// MockHorizonServer
// ---------------------------------------------------------------------------

/// A local mock Horizon server.
pub struct MockHorizonServer {
    state: ServerState,
    shutdown_tx: Option<oneshot::Sender<()>>,
    addr: Option<SocketAddr>,
}

impl MockHorizonServer {
    /// Create a new server (not yet started).
    pub fn new() -> Self {
        Self {
            state: ServerState {
                config: Arc::new(Mutex::new(MockHorizonConfig::default())),
                requests: Arc::new(Mutex::new(Vec::new())),
                request_count: Arc::new(AtomicUsize::new(0)),
                account_overrides: Arc::new(Mutex::new(HashMap::new())),
            },
            shutdown_tx: None,
            addr: None,
        }
    }

    /// Start the server on a random port.  Returns the bound URL.
    pub async fn start(&mut self) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        self.addr = Some(addr);

        let state = self.state.clone();
        let app = Router::new()
            .route("/{*path}", any(handle_request))
            .route("/", any(handle_request))
            .with_state(state);

        let (tx, rx) = oneshot::channel::<()>();
        self.shutdown_tx = Some(tx);

        tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    rx.await.ok();
                })
                .await
                .ok();
        });

        format!("http://{addr}")
    }

    /// Stop the server.
    pub async fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }

    /// Reconfigure the server at runtime.
    pub fn configure(&self, config: MockHorizonConfig) {
        *self.state.config.lock().unwrap() = config;
        self.state.request_count.store(0, Ordering::SeqCst);
    }

    /// Return all captured requests and clear the buffer.
    pub fn drain_requests(&self) -> Vec<CapturedRequest> {
        self.state.requests.lock().unwrap().drain(..).collect()
    }

    /// Return the number of requests received so far.
    pub fn request_count(&self) -> usize {
        self.state.request_count.load(Ordering::SeqCst)
    }

    /// Convenience: set a single default scenario.
    pub fn set_scenario(&self, scenario: HorizonScenario) {
        let mut cfg = self.state.config.lock().unwrap();
        cfg.default_scenario = Some(scenario);
        cfg.fail_count = 0;
        drop(cfg);
        self.state.request_count.store(0, Ordering::SeqCst);
    }

    /// Convenience: reset to success.
    pub fn reset(&self) {
        let mut cfg = self.state.config.lock().unwrap();
        *cfg = MockHorizonConfig::default();
        drop(cfg);
        self.state.request_count.store(0, Ordering::SeqCst);
        self.state.requests.lock().unwrap().clear();
        self.state.account_overrides.lock().unwrap().clear();
    }

    /// Override Horizon account auth fields (`thresholds`, `signers`) for a public key.
    pub fn set_account_auth(&self, account_id: &str, auth: serde_json::Value) {
        self.state
            .account_overrides
            .lock()
            .unwrap()
            .insert(account_id.to_string(), auth);
    }
}

impl Default for MockHorizonServer {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async fn handle_request(State(state): State<ServerState>, req: Request<Body>) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().to_string();
    let body_bytes = axum::body::to_bytes(req.into_body(), usize::MAX)
        .await
        .unwrap_or_default();
    let body = String::from_utf8_lossy(&body_bytes).to_string();

    // Capture the request.
    state.requests.lock().unwrap().push(CapturedRequest {
        method: method.clone(),
        path: path.clone(),
        body: body.clone(),
    });

    let count = state.request_count.fetch_add(1, Ordering::SeqCst) + 1;

    // Determine the scenario.
    let (scenario, latency_ms) = {
        let cfg = state.config.lock().unwrap();
        let fail_count = cfg.fail_count;

        // If fail_count is set and we've exceeded it, succeed.
        let effective_scenario = if fail_count > 0 && count > fail_count {
            HorizonScenario::Success
        } else {
            cfg.path_scenarios
                .get(&path)
                .cloned()
                .or_else(|| cfg.default_scenario.clone())
                .unwrap_or(HorizonScenario::Success)
        };

        (effective_scenario, cfg.latency_ms)
    };

    // Apply latency.
    if latency_ms > 0 {
        sleep(Duration::from_millis(latency_ms)).await;
    }

    build_response(&state, &path, scenario).await
}

async fn build_response(state: &ServerState, path: &str, scenario: HorizonScenario) -> Response {
    match scenario {
        HorizonScenario::Success => success_response(state, path),

        HorizonScenario::RateLimit => (
            StatusCode::TOO_MANY_REQUESTS,
            [("retry-after", "1"), ("content-type", "application/json")],
            json!({"type": "https://stellar.org/horizon-errors/rate_limit_exceeded", "title": "Rate Limit Exceeded", "status": 429}).to_string(),
        )
            .into_response(),

        HorizonScenario::InternalError => (
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({"type": "https://stellar.org/horizon-errors/server_error", "title": "Internal Server Error", "status": 500}).to_string(),
        )
            .into_response(),

        HorizonScenario::BadGateway => (
            StatusCode::BAD_GATEWAY,
            "Bad Gateway",
        )
            .into_response(),

        HorizonScenario::ServiceUnavailable => (
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"type": "https://stellar.org/horizon-errors/service_unavailable", "title": "Service Unavailable", "status": 503}).to_string(),
        )
            .into_response(),

        HorizonScenario::GatewayTimeout { delay_ms } => {
            sleep(Duration::from_millis(delay_ms)).await;
            (StatusCode::GATEWAY_TIMEOUT, "Gateway Timeout").into_response()
        }

        HorizonScenario::ConnectionReset => {
            // Return an empty body with a connection-close header to simulate
            // a reset.  True TCP-level resets require raw socket manipulation
            // which is not practical in an in-process test server; this is the
            // closest approximation available via HTTP.
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                [("connection", "close")],
                "",
            )
                .into_response()
        }

        HorizonScenario::TxBadSeq => (
            StatusCode::BAD_REQUEST,
            json!({
                "type": "https://stellar.org/horizon-errors/transaction_failed",
                "title": "Transaction Failed",
                "status": 400,
                "extras": {
                    "result_codes": {
                        "transaction": "tx_bad_seq"
                    }
                }
            })
            .to_string(),
        )
            .into_response(),

        HorizonScenario::TxInsufficientFee => (
            StatusCode::BAD_REQUEST,
            json!({
                "type": "https://stellar.org/horizon-errors/transaction_failed",
                "title": "Transaction Failed",
                "status": 400,
                "extras": {
                    "result_codes": {
                        "transaction": "tx_insufficient_fee"
                    }
                }
            })
            .to_string(),
        )
            .into_response(),

        HorizonScenario::TxFailed => (
            StatusCode::BAD_REQUEST,
            json!({
                "type": "https://stellar.org/horizon-errors/transaction_failed",
                "title": "Transaction Failed",
                "status": 400,
                "extras": {
                    "result_codes": {
                        "transaction": "tx_failed",
                        "operations": ["op_bad_auth"]
                    }
                }
            })
            .to_string(),
        )
            .into_response(),
    }
}

fn success_response(state: &ServerState, path: &str) -> Response {
    let body = match path {
        "/fee_stats" => json!({
            "last_ledger": "123456",
            "last_ledger_base_fee": "100",
            "ledger_capacity_usage": "0.5",
            "fee_charged": {
                "max": "200",
                "min": "100",
                "mode": "100",
                "p10": "100",
                "p20": "100",
                "p30": "100",
                "p40": "100",
                "p50": "100",
                "p60": "100",
                "p70": "150",
                "p80": "200",
                "p90": "200",
                "p95": "200",
                "p99": "200"
            },
            "max_fee": {
                "max": "10000",
                "min": "100",
                "mode": "100",
                "p10": "100",
                "p20": "100",
                "p30": "100",
                "p40": "100",
                "p50": "100",
                "p60": "100",
                "p70": "150",
                "p80": "200",
                "p90": "200",
                "p95": "200",
                "p99": "200"
            }
        }),
        p if p.starts_with("/accounts/") => {
            let account_id = p.trim_start_matches("/accounts/");
            let mut account = json!({
                "id": account_id,
                "sequence": "1234567890",
                "balances": [{"asset_type": "native", "balance": "100.0000000"}],
                "thresholds": {
                    "low_threshold": 0,
                    "med_threshold": 0,
                    "high_threshold": 0
                },
                "signers": [{
                    "weight": 1,
                    "key": account_id,
                    "type": "ed25519_public_key"
                }]
            });
            if let Some(override_auth) = state.account_overrides.lock().unwrap().get(account_id) {
                if let Some(thresholds) = override_auth.get("thresholds") {
                    account["thresholds"] = thresholds.clone();
                }
                if let Some(signers) = override_auth.get("signers") {
                    account["signers"] = signers.clone();
                }
            }
            account
        }
        "/transactions" => json!({
            "hash": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
            "successful": true,
            "ledger": 123456
        }),
        _ => json!({"status": "ok"}),
    };

    (
        StatusCode::OK,
        [("content-type", "application/json")],
        body.to_string(),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    async fn get(url: &str) -> reqwest::Response {
        reqwest::Client::new().get(url).send().await.unwrap()
    }

    async fn post(url: &str, body: &str) -> reqwest::Response {
        reqwest::Client::new()
            .post(url)
            .header("content-type", "application/json")
            .body(body.to_string())
            .send()
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn happy_path_fee_stats() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;

        let resp = get(&format!("{base}/fee_stats")).await;
        assert_eq!(resp.status(), 200);
        let json: serde_json::Value = resp.json().await.unwrap();
        assert!(json.get("fee_charged").is_some());

        server.stop().await;
    }

    #[tokio::test]
    async fn happy_path_submit_transaction() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;

        let resp = post(&format!("{base}/transactions"), r#"{"tx":"abc"}"#).await;
        assert_eq!(resp.status(), 200);
        let json: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(json["successful"], true);

        server.stop().await;
    }

    #[tokio::test]
    async fn rate_limit_scenario() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.set_scenario(HorizonScenario::RateLimit);

        let resp = post(&format!("{base}/transactions"), "{}").await;
        assert_eq!(resp.status(), 429);
        assert_eq!(resp.headers().get("retry-after").unwrap(), "1");

        server.stop().await;
    }

    #[tokio::test]
    async fn internal_error_scenario() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.set_scenario(HorizonScenario::InternalError);

        let resp = get(&format!("{base}/fee_stats")).await;
        assert_eq!(resp.status(), 500);

        server.stop().await;
    }

    #[tokio::test]
    async fn service_unavailable_scenario() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.set_scenario(HorizonScenario::ServiceUnavailable);

        let resp = get(&format!("{base}/fee_stats")).await;
        assert_eq!(resp.status(), 503);

        server.stop().await;
    }

    #[tokio::test]
    async fn tx_bad_seq_scenario() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.set_scenario(HorizonScenario::TxBadSeq);

        let resp = post(&format!("{base}/transactions"), "{}").await;
        assert_eq!(resp.status(), 400);
        let json: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(json["extras"]["result_codes"]["transaction"], "tx_bad_seq");

        server.stop().await;
    }

    #[tokio::test]
    async fn tx_insufficient_fee_scenario() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.set_scenario(HorizonScenario::TxInsufficientFee);

        let resp = post(&format!("{base}/transactions"), "{}").await;
        assert_eq!(resp.status(), 400);
        let json: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(
            json["extras"]["result_codes"]["transaction"],
            "tx_insufficient_fee"
        );

        server.stop().await;
    }

    #[tokio::test]
    async fn tx_failed_scenario() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.set_scenario(HorizonScenario::TxFailed);

        let resp = post(&format!("{base}/transactions"), "{}").await;
        assert_eq!(resp.status(), 400);
        let json: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(json["extras"]["result_codes"]["transaction"], "tx_failed");

        server.stop().await;
    }

    #[tokio::test]
    async fn fail_count_resets_to_success() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.configure(MockHorizonConfig {
            default_scenario: Some(HorizonScenario::InternalError),
            fail_count: 2,
            ..Default::default()
        });

        // First two requests fail.
        assert_eq!(get(&format!("{base}/fee_stats")).await.status(), 500);
        assert_eq!(get(&format!("{base}/fee_stats")).await.status(), 500);
        // Third request succeeds (fail_count exceeded).
        assert_eq!(get(&format!("{base}/fee_stats")).await.status(), 200);

        server.stop().await;
    }

    #[tokio::test]
    async fn per_path_scenario_override() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;

        let mut path_scenarios = HashMap::new();
        path_scenarios.insert("/transactions".to_string(), HorizonScenario::RateLimit);

        server.configure(MockHorizonConfig {
            default_scenario: Some(HorizonScenario::Success),
            path_scenarios,
            ..Default::default()
        });

        // /fee_stats uses default (success)
        assert_eq!(get(&format!("{base}/fee_stats")).await.status(), 200);
        // /transactions uses per-path override (rate limit)
        assert_eq!(
            post(&format!("{base}/transactions"), "{}").await.status(),
            429
        );

        server.stop().await;
    }

    #[tokio::test]
    async fn request_capture() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;

        post(&format!("{base}/transactions"), r#"{"tx":"hello"}"#).await;

        let captured = server.drain_requests();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0].path, "/transactions");
        assert_eq!(captured[0].method, "POST");
        assert!(captured[0].body.contains("hello"));

        // drain clears the buffer
        assert!(server.drain_requests().is_empty());

        server.stop().await;
    }

    #[tokio::test]
    async fn latency_injection() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.configure(MockHorizonConfig {
            latency_ms: 50,
            ..Default::default()
        });

        let start = std::time::Instant::now();
        get(&format!("{base}/fee_stats")).await;
        assert!(start.elapsed().as_millis() >= 50);

        server.stop().await;
    }

    #[tokio::test]
    async fn bad_gateway_scenario() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;
        server.set_scenario(HorizonScenario::BadGateway);

        let resp = get(&format!("{base}/fee_stats")).await;
        assert_eq!(resp.status(), 502);

        server.stop().await;
    }

    #[tokio::test]
    async fn request_count_increments() {
        let mut server = MockHorizonServer::new();
        let base = server.start().await;

        assert_eq!(server.request_count(), 0);
        get(&format!("{base}/fee_stats")).await;
        get(&format!("{base}/fee_stats")).await;
        assert_eq!(server.request_count(), 2);

        server.stop().await;
    }
}
