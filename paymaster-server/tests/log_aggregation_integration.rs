use std::sync::Mutex;

use fluid_server::logging::{LogAggregationConfig, LogProvider};

static ENV_LOCK: Mutex<()> = Mutex::new(());

fn clear_log_env() {
    std::env::remove_var("FLUID_LOG_AGGREGATION_PROVIDER");
    std::env::remove_var("FLUID_LOG_AGGREGATION_ENDPOINT");
    std::env::remove_var("FLUID_LOG_AGGREGATION_API_KEY");
    std::env::remove_var("FLUID_LOG_AGGREGATION_BATCH_SIZE");
    std::env::remove_var("FLUID_LOG_AGGREGATION_FLUSH_MS");
    std::env::remove_var("FLUID_LOG_AGGREGATION_TIMEOUT_MS");
    std::env::remove_var("FLUID_LOG_AGGREGATION_ELK_INDEX");
    std::env::remove_var("FLUID_SERVICE_NAME");
}

#[test]
fn datadog_env_configuration_is_loaded() {
    let _lock = ENV_LOCK.lock().expect("env lock");
    clear_log_env();

    std::env::set_var("FLUID_LOG_AGGREGATION_PROVIDER", "datadog");
    std::env::set_var("FLUID_LOG_AGGREGATION_API_KEY", "dd-api-key");
    std::env::set_var("FLUID_LOG_AGGREGATION_BATCH_SIZE", "10");
    std::env::set_var("FLUID_SERVICE_NAME", "fluid-prod");

    let config = LogAggregationConfig::from_env().expect("config should parse");
    assert_eq!(config.provider, LogProvider::Datadog);
    assert_eq!(
        config.endpoint.as_deref(),
        Some("https://http-intake.logs.datadoghq.com/api/v2/logs")
    );
    assert_eq!(config.api_key.as_deref(), Some("dd-api-key"));
    assert_eq!(config.batch_size, 10);
    assert_eq!(config.service_name, "fluid-prod");

    clear_log_env();
}

#[test]
fn elk_env_configuration_uses_bulk_defaults_and_clamps_limits() {
    let _lock = ENV_LOCK.lock().expect("env lock");
    clear_log_env();

    std::env::set_var("FLUID_LOG_AGGREGATION_PROVIDER", "elk");
    std::env::set_var("FLUID_LOG_AGGREGATION_BATCH_SIZE", "0");
    std::env::set_var("FLUID_LOG_AGGREGATION_FLUSH_MS", "1");
    std::env::set_var("FLUID_LOG_AGGREGATION_TIMEOUT_MS", "1");

    let config = LogAggregationConfig::from_env().expect("config should parse");
    assert_eq!(config.provider, LogProvider::Elk);
    assert_eq!(config.endpoint.as_deref(), Some("http://localhost:9200/_bulk"));
    assert_eq!(config.batch_size, 1);
    assert_eq!(config.flush_interval.as_millis(), 100);
    assert_eq!(config.request_timeout.as_millis(), 100);

    clear_log_env();
}

#[test]
fn newrelic_requires_api_key() {
    let _lock = ENV_LOCK.lock().expect("env lock");
    clear_log_env();

    std::env::set_var("FLUID_LOG_AGGREGATION_PROVIDER", "newrelic");

    let error = LogAggregationConfig::from_env().expect_err("api key should be required");
    assert!(error.contains("API key"));

    clear_log_env();
}
