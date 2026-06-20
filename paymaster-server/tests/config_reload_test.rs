use paymaster_server::config::Config;
use paymaster_server::state::AppState;

#[tokio::test]
async fn live_config_reload_updates_base_fee() {
    let mut config = Config {
        allowed_origins: vec![],
        base_fee: 100, // Initial base fee
        fee_multiplier: 1.0,
        global_rate_limit_max: 10,
        global_rate_limit_window_ms: 60_000,
        horizon_selection_strategy: paymaster_server::config::HorizonSelectionStrategy::Priority,
        horizon_urls: vec!["http://localhost:8000".to_string()],
        max_operations_per_envelope: 100,
        network_passphrase: "Test SDF Network ; September 2015".to_string(),
        port: 0,
        disable_rate_limits: true,
    };

    // Secret for SignerPool
    let secrets = vec![
        "SDMOYUZMPBA5SDXYC7346UPSFC3LA2QSHWI67M7ZW6G2D55TJ2H3A4IE".to_string(),
    ];

    let state = AppState::new(config.clone(), &secrets).expect("should initialize state");

    // Verify initial fee
    {
        let current_config = state.config.read().unwrap();
        assert_eq!(current_config.base_fee, 100);
    }

    // Update config
    config.base_fee = 250;
    state.reload_config(config);

    // Verify updated fee
    {
        let current_config = state.config.read().unwrap();
        assert_eq!(current_config.base_fee, 250);
    }
}
