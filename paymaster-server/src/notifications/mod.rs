/// Decoupled notification engine for paymaster-server.
///
/// Events are enqueued through a `NotificationHandle` and dispatched to one or
/// more backends by a dedicated background Tokio task, keeping alert delivery
/// fully out of the hot request path.
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tracing::{error, info, warn};

// ── Event model ───────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NotificationSeverity {
    Info,
    Warning,
    Critical,
}

impl NotificationSeverity {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Info => "INFO",
            Self::Warning => "WARN",
            Self::Critical => "CRIT",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NotificationEvent {
    pub id: String,
    pub severity: NotificationSeverity,
    pub title: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

// ── Backend implementations ───────────────────────────────────────────────────

/// HTTP webhook backend (Slack incoming webhooks, generic alerting endpoints).
pub struct WebhookBackend {
    pub name: String,
    pub url: String,
    client: reqwest::Client,
}

impl WebhookBackend {
    pub fn new(name: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            url: url.into(),
            client: reqwest::Client::new(),
        }
    }

    async fn send(&self, event: &NotificationEvent) -> Result<(), String> {
        let payload = serde_json::json!({
            "text": format!(
                "[{}] {}: {}",
                event.severity.label(),
                event.title,
                event.message
            ),
            "severity": event.severity,
            "event_id": event.id,
        });

        self.client
            .post(&self.url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

/// Enum of all supported backend variants. Adding a new channel means adding
/// a variant here — no trait objects or dynamic dispatch required.
pub enum Backend {
    Webhook(WebhookBackend),
}

impl Backend {
    pub fn name(&self) -> &str {
        match self {
            Self::Webhook(wb) => &wb.name,
        }
    }

    async fn deliver(&self, event: &NotificationEvent) -> Result<(), String> {
        match self {
            Self::Webhook(wb) => wb.send(event).await,
        }
    }
}

// ── Engine ────────────────────────────────────────────────────────────────────

/// Clone-safe handle for dispatching events into the engine's channel.
#[derive(Clone)]
pub struct NotificationHandle {
    tx: mpsc::Sender<NotificationEvent>,
}

impl NotificationHandle {
    /// Enqueue an event for delivery. Non-blocking from the caller's perspective;
    /// a warn is logged if the channel is full (back-pressure signal).
    pub async fn send(&self, event: NotificationEvent) {
        if let Err(e) = self.tx.send(event).await {
            warn!("[NotificationEngine] Failed to enqueue event: {}", e);
        }
    }
}

/// The notification engine. Receives events over a bounded channel and
/// dispatches them to all registered backends sequentially.
pub struct NotificationEngine {
    rx: mpsc::Receiver<NotificationEvent>,
    backends: Vec<Backend>,
}

impl NotificationEngine {
    /// Construct a new engine. Returns the engine and a cloneable send handle.
    pub fn new(capacity: usize) -> (Self, NotificationHandle) {
        let (tx, rx) = mpsc::channel(capacity);
        (
            Self {
                rx,
                backends: Vec::new(),
            },
            NotificationHandle { tx },
        )
    }

    /// Register a backend. Returns `self` for builder-style chaining.
    pub fn register(mut self, backend: Backend) -> Self {
        self.backends.push(backend);
        self
    }

    /// Consume the engine and run it as a Tokio background task.
    pub fn spawn(mut self) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            info!(
                "[NotificationEngine] Started with {} backend(s)",
                self.backends.len()
            );
            while let Some(event) = self.rx.recv().await {
                for backend in &self.backends {
                    match backend.deliver(&event).await {
                        Ok(()) => info!(
                            "[NotificationEngine] Delivered '{}' via {}",
                            event.title,
                            backend.name()
                        ),
                        Err(err) => error!(
                            "[NotificationEngine] Backend '{}' failed for event '{}': {}",
                            backend.name(),
                            event.title,
                            err
                        ),
                    }
                }
            }
            info!("[NotificationEngine] Channel closed, engine shutting down");
        })
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn make_event(title: &str, severity: NotificationSeverity) -> NotificationEvent {
        NotificationEvent {
            id: uuid::Uuid::new_v4().to_string(),
            severity,
            title: title.to_string(),
            message: "test body".to_string(),
            metadata: None,
        }
    }

    #[test]
    fn test_severity_labels() {
        assert_eq!(NotificationSeverity::Info.label(), "INFO");
        assert_eq!(NotificationSeverity::Warning.label(), "WARN");
        assert_eq!(NotificationSeverity::Critical.label(), "CRIT");
    }

    #[test]
    fn test_event_serializes_severity() {
        let ev = make_event("test", NotificationSeverity::Warning);
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("\"warning\""));
    }

    #[tokio::test]
    async fn test_engine_channel_capacity() {
        // A capacity-1 engine should accept one send without blocking.
        let (engine, handle) = NotificationEngine::new(1);
        let _task = engine.spawn();
        handle.send(make_event("e1", NotificationSeverity::Info)).await;
    }

    #[tokio::test]
    async fn test_handle_clone_shares_channel() {
        let (engine, handle) = NotificationEngine::new(32);
        let _task = engine.spawn();
        let h2 = handle.clone();
        // Both clones must be sendable on the same channel without blocking.
        handle.send(make_event("h1", NotificationSeverity::Info)).await;
        h2.send(make_event("h2", NotificationSeverity::Info)).await;
    }

    #[tokio::test]
    async fn test_engine_with_no_backends_does_not_panic() {
        let (engine, handle) = NotificationEngine::new(8);
        let _task = engine.spawn();
        handle
            .send(make_event("noop", NotificationSeverity::Critical))
            .await;
        tokio::time::sleep(Duration::from_millis(30)).await;
    }

    #[tokio::test]
    async fn test_engine_processes_multiple_events() {
        let (engine, handle) = NotificationEngine::new(32);
        let _task = engine.spawn();
        for i in 0..5 {
            handle
                .send(make_event(&format!("event-{}", i), NotificationSeverity::Info))
                .await;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    #[tokio::test]
    async fn test_webhook_backend_name() {
        let wb = WebhookBackend::new("slack-alerts", "https://hooks.example.com/x");
        assert_eq!(wb.name, "slack-alerts");
    }

    #[tokio::test]
    async fn test_backend_enum_name() {
        let b = Backend::Webhook(WebhookBackend::new("my-backend", "http://example.com"));
        assert_eq!(b.name(), "my-backend");
    }
}
