use std::{
    fmt,
    str::FromStr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tokio::{
    sync::mpsc,
    time::{self, Instant},
};
use tracing::Subscriber;
use tracing_subscriber::{
    layer::{Context, Layer},
    prelude::*,
    registry::LookupSpan,
    util::SubscriberInitExt,
};

const DEFAULT_BATCH_SIZE: usize = 50;
const DEFAULT_FLUSH_MS: u64 = 3_000;
const DEFAULT_TIMEOUT_MS: u64 = 5_000;
const MAX_QUEUE_SIZE: usize = 2_000;
const MAX_FIELD_VALUE_BYTES: usize = 2_048;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogProvider {
    Disabled,
    Datadog,
    Elk,
    NewRelic,
}

impl LogProvider {
    fn default_endpoint(self) -> Option<&'static str> {
        match self {
            Self::Disabled => None,
            Self::Datadog => Some("https://http-intake.logs.datadoghq.com/api/v2/logs"),
            Self::Elk => Some("http://localhost:9200/_bulk"),
            Self::NewRelic => Some("https://log-api.newrelic.com/log/v1"),
        }
    }

    fn requires_api_key(self) -> bool {
        matches!(self, Self::Datadog | Self::NewRelic)
    }
}

impl FromStr for LogProvider {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let normalized = value.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "" | "none" | "disabled" => Ok(Self::Disabled),
            "datadog" | "dd" => Ok(Self::Datadog),
            "elk" | "elasticsearch" => Ok(Self::Elk),
            "newrelic" | "new_relic" | "nr" => Ok(Self::NewRelic),
            _ => Err(format!("unsupported log provider: {value}")),
        }
    }
}

#[derive(Clone, Debug)]
pub struct LogAggregationConfig {
    pub provider: LogProvider,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
    pub batch_size: usize,
    pub flush_interval: Duration,
    pub request_timeout: Duration,
    pub elk_index: String,
    pub service_name: String,
}

impl Default for LogAggregationConfig {
    fn default() -> Self {
        Self {
            provider: LogProvider::Disabled,
            endpoint: None,
            api_key: None,
            batch_size: DEFAULT_BATCH_SIZE,
            flush_interval: Duration::from_millis(DEFAULT_FLUSH_MS),
            request_timeout: Duration::from_millis(DEFAULT_TIMEOUT_MS),
            elk_index: "fluid-server-logs".to_string(),
            service_name: "fluid-server".to_string(),
        }
    }
}

impl LogAggregationConfig {
    pub fn from_env() -> Result<Self, String> {
        let provider = std::env::var("FLUID_LOG_AGGREGATION_PROVIDER")
            .unwrap_or_else(|_| "disabled".to_string())
            .parse::<LogProvider>()?;

        let endpoint = std::env::var("FLUID_LOG_AGGREGATION_ENDPOINT")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .or_else(|| provider.default_endpoint().map(ToString::to_string));

        let api_key = std::env::var("FLUID_LOG_AGGREGATION_API_KEY")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let batch_size = env_parse("FLUID_LOG_AGGREGATION_BATCH_SIZE", DEFAULT_BATCH_SIZE)
            .clamp(1, 1_000);
        let flush_ms = env_parse("FLUID_LOG_AGGREGATION_FLUSH_MS", DEFAULT_FLUSH_MS).max(100);
        let timeout_ms =
            env_parse("FLUID_LOG_AGGREGATION_TIMEOUT_MS", DEFAULT_TIMEOUT_MS).max(100);
        let elk_index = std::env::var("FLUID_LOG_AGGREGATION_ELK_INDEX")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "fluid-server-logs".to_string());
        let service_name = std::env::var("FLUID_SERVICE_NAME")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "fluid-server".to_string());

        let config = Self {
            provider,
            endpoint,
            api_key,
            batch_size,
            flush_interval: Duration::from_millis(flush_ms),
            request_timeout: Duration::from_millis(timeout_ms),
            elk_index,
            service_name,
        };
        config.validate()?;
        Ok(config)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.provider == LogProvider::Disabled {
            return Ok(());
        }

        let endpoint = self
            .endpoint
            .as_deref()
            .ok_or_else(|| "log aggregation endpoint is required when provider is enabled".to_string())?;
        if !(endpoint.starts_with("http://") || endpoint.starts_with("https://")) {
            return Err("log aggregation endpoint must start with http:// or https://".to_string());
        }

        if self.provider.requires_api_key() && self.api_key.is_none() {
            return Err("log aggregation API key is required for selected provider".to_string());
        }

        Ok(())
    }
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

#[derive(Debug)]
pub enum LoggingInitError {
    Config(String),
    Subscriber(String),
}

impl fmt::Display for LoggingInitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config(message) => write!(f, "{message}"),
            Self::Subscriber(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for LoggingInitError {}

#[derive(Clone, Debug)]
pub struct LoggingInitReport {
    pub provider: LogProvider,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct AggregatedLog {
    timestamp_ms: u128,
    level: String,
    target: String,
    fields: serde_json::Value,
    service: String,
}

pub fn init_logging_from_env() -> Result<LoggingInitReport, LoggingInitError> {
    let config = LogAggregationConfig::from_env().map_err(LoggingInitError::Config)?;
    init_logging(config)
}

fn init_logging(config: LogAggregationConfig) -> Result<LoggingInitReport, LoggingInitError> {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "fluid_server=info,tower_http=info".into());

    if config.provider == LogProvider::Disabled {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(tracing_subscriber::fmt::layer())
            .try_init()
            .map_err(|error| LoggingInitError::Subscriber(error.to_string()))?;

        return Ok(LoggingInitReport {
            provider: config.provider,
            endpoint: None,
        });
    }

    let (sender, receiver) = mpsc::channel(MAX_QUEUE_SIZE);
    let endpoint = config.endpoint.clone();
    tokio::spawn(export_worker(config.clone(), receiver));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().json())
        .with(AggregationLayer {
            sender,
            service_name: config.service_name,
        })
        .try_init()
        .map_err(|error| LoggingInitError::Subscriber(error.to_string()))?;

    Ok(LoggingInitReport {
        provider: config.provider,
        endpoint,
    })
}

struct AggregationLayer {
    sender: mpsc::Sender<AggregatedLog>,
    service_name: String,
}

impl<S> Layer<S> for AggregationLayer
where
    S: Subscriber + for<'lookup> LookupSpan<'lookup>,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let mut visitor = FieldVisitor::default();
        event.record(&mut visitor);

        let record = AggregatedLog {
            timestamp_ms: now_ms(),
            level: event.metadata().level().to_string(),
            target: event.metadata().target().to_string(),
            fields: visitor.into_json(),
            service: self.service_name.clone(),
        };

        if self.sender.try_send(record).is_err() {
            tracing::warn!("log aggregation queue is full; dropping event");
        }
    }
}

#[derive(Default)]
struct FieldVisitor {
    values: serde_json::Map<String, serde_json::Value>,
}

impl FieldVisitor {
    fn insert_str(&mut self, key: &str, value: &str) {
        let trimmed = if value.len() > MAX_FIELD_VALUE_BYTES {
            &value[..MAX_FIELD_VALUE_BYTES]
        } else {
            value
        };
        self.values
            .insert(key.to_string(), serde_json::Value::String(trimmed.to_string()));
    }

    fn into_json(self) -> serde_json::Value {
        serde_json::Value::Object(self.values)
    }
}

impl tracing::field::Visit for FieldVisitor {
    fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
        self.values
            .insert(field.name().to_string(), serde_json::Value::Bool(value));
    }

    fn record_f64(&mut self, field: &tracing::field::Field, value: f64) {
        if let Some(number) = serde_json::Number::from_f64(value) {
            self.values
                .insert(field.name().to_string(), serde_json::Value::Number(number));
        }
    }

    fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
        self.values.insert(
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        );
    }

    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        self.values.insert(
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        );
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        self.insert_str(field.name(), value);
    }

    fn record_error(
        &mut self,
        field: &tracing::field::Field,
        value: &(dyn std::error::Error + 'static),
    ) {
        self.insert_str(field.name(), &value.to_string());
    }

    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn fmt::Debug) {
        self.insert_str(field.name(), &format!("{value:?}"));
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

async fn export_worker(config: LogAggregationConfig, mut receiver: mpsc::Receiver<AggregatedLog>) {
    let mut interval = time::interval(config.flush_interval);
    interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

    let client = reqwest::Client::builder()
        .timeout(config.request_timeout)
        .build();
    let Ok(client) = client else {
        eprintln!("[log-aggregation] failed to build HTTP client");
        return;
    };

    let mut batch = Vec::with_capacity(config.batch_size);
    loop {
        tokio::select! {
            Some(record) = receiver.recv() => {
                batch.push(record);
                if batch.len() >= config.batch_size {
                    flush_batch(&client, &config, &mut batch).await;
                }
            }
            _ = interval.tick() => {
                if !batch.is_empty() {
                    flush_batch(&client, &config, &mut batch).await;
                }
            }
            else => {
                if !batch.is_empty() {
                    flush_batch(&client, &config, &mut batch).await;
                }
                break;
            }
        }
    }
}

async fn flush_batch(client: &reqwest::Client, config: &LogAggregationConfig, batch: &mut Vec<AggregatedLog>) {
    let payload = match build_payload(config, batch) {
        Ok(payload) => payload,
        Err(error) => {
            eprintln!("[log-aggregation] failed to build payload: {error}");
            batch.clear();
            return;
        }
    };

    let Some(endpoint) = config.endpoint.as_deref() else {
        batch.clear();
        return;
    };

    let mut request = client.post(endpoint);
    match config.provider {
        LogProvider::Datadog => {
            if let Some(api_key) = config.api_key.as_deref() {
                request = request.header("DD-API-KEY", api_key);
            }
            request = request.header("Content-Type", "application/json");
        }
        LogProvider::NewRelic => {
            if let Some(api_key) = config.api_key.as_deref() {
                request = request.header("Api-Key", api_key);
            }
            request = request.header("Content-Type", "application/json");
        }
        LogProvider::Elk => {
            request = request.header("Content-Type", "application/x-ndjson");
        }
        LogProvider::Disabled => {}
    }

    let started = Instant::now();
    match request.body(payload).send().await {
        Ok(response) if response.status().is_success() => {
            let elapsed = started.elapsed().as_millis();
            tracing::debug!("log batch exported in {elapsed}ms");
        }
        Ok(response) => {
            eprintln!(
                "[log-aggregation] export failed with status {}",
                response.status()
            );
        }
        Err(error) => {
            eprintln!("[log-aggregation] export request failed: {error}");
        }
    }

    batch.clear();
}

fn build_payload(config: &LogAggregationConfig, batch: &[AggregatedLog]) -> Result<String, String> {
    match config.provider {
        LogProvider::Datadog | LogProvider::NewRelic => {
            serde_json::to_string(batch).map_err(|error| error.to_string())
        }
        LogProvider::Elk => build_elk_bulk_payload(&config.elk_index, batch),
        LogProvider::Disabled => Ok(String::new()),
    }
}

fn build_elk_bulk_payload(index: &str, batch: &[AggregatedLog]) -> Result<String, String> {
    let mut payload = String::new();
    let action_line = serde_json::to_string(&serde_json::json!({
        "index": {
            "_index": index,
        }
    }))
    .map_err(|error| error.to_string())?;

    for record in batch {
        payload.push_str(&action_line);
        payload.push('\n');
        let line = serde_json::to_string(record).map_err(|error| error.to_string())?;
        payload.push_str(&line);
        payload.push('\n');
    }

    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_record(level: &str) -> AggregatedLog {
        AggregatedLog {
            timestamp_ms: 123,
            level: level.to_string(),
            target: "test".to_string(),
            fields: serde_json::json!({"message": "hello"}),
            service: "fluid-server".to_string(),
        }
    }

    #[test]
    fn provider_parsing_accepts_aliases() {
        assert_eq!("disabled".parse::<LogProvider>().unwrap(), LogProvider::Disabled);
        assert_eq!("dd".parse::<LogProvider>().unwrap(), LogProvider::Datadog);
        assert_eq!("elasticsearch".parse::<LogProvider>().unwrap(), LogProvider::Elk);
        assert_eq!("nr".parse::<LogProvider>().unwrap(), LogProvider::NewRelic);
    }

    #[test]
    fn validate_requires_api_key_for_datadog_and_newrelic() {
        let mut config = LogAggregationConfig {
            provider: LogProvider::Datadog,
            endpoint: Some("https://http-intake.logs.datadoghq.com/api/v2/logs".to_string()),
            ..LogAggregationConfig::default()
        };
        assert!(config.validate().is_err());

        config.provider = LogProvider::NewRelic;
        config.endpoint = Some("https://log-api.newrelic.com/log/v1".to_string());
        assert!(config.validate().is_err());
    }

    #[test]
    fn validate_rejects_non_http_endpoint() {
        let config = LogAggregationConfig {
            provider: LogProvider::Elk,
            endpoint: Some("ftp://example.com".to_string()),
            ..LogAggregationConfig::default()
        };
        assert!(config.validate().is_err());
    }

    #[test]
    fn build_payload_for_datadog_is_json_array() {
        let config = LogAggregationConfig {
            provider: LogProvider::Datadog,
            endpoint: Some("https://http-intake.logs.datadoghq.com/api/v2/logs".to_string()),
            api_key: Some("test".to_string()),
            ..LogAggregationConfig::default()
        };
        let payload = build_payload(&config, &[make_record("INFO")]).unwrap();
        assert!(payload.starts_with("["));
        assert!(payload.contains("\"service\":\"fluid-server\""));
    }

    #[test]
    fn build_payload_for_elk_is_bulk_ndjson() {
        let config = LogAggregationConfig {
            provider: LogProvider::Elk,
            endpoint: Some("http://localhost:9200/_bulk".to_string()),
            elk_index: "my-index".to_string(),
            ..LogAggregationConfig::default()
        };

        let payload = build_payload(&config, &[make_record("WARN"), make_record("INFO")]).unwrap();
        let lines: Vec<&str> = payload.lines().collect();
        assert_eq!(lines.len(), 4);
        assert!(lines[0].contains("my-index"));
        assert!(lines[1].contains("\"level\":\"WARN\""));
        assert!(lines[3].contains("\"level\":\"INFO\""));
    }
}