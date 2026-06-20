use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::info;

pub const CONTRACT_CACHE_TTL_SECS: u64 = 300;

/// Parsed representation of a Soroban contract's WASM definition.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ContractDefinition {
    pub contract_id: String,
    pub wasm_hash: String,
    pub network: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wasm_bytes: Option<Vec<u8>>,
    pub cached_at_ms: u128,
}

/// Ledger footprint schema describing which keys are read/written during execution.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FootprintSchema {
    pub contract_id: String,
    pub read_only: Vec<String>,
    pub read_write: Vec<String>,
    pub cached_at_ms: u128,
}

struct CacheEntry<T> {
    value: T,
    expires_at: Instant,
}

impl<T: Clone> CacheEntry<T> {
    fn new(value: T, ttl: Duration) -> Self {
        Self {
            value,
            expires_at: Instant::now() + ttl,
        }
    }

    fn is_expired(&self) -> bool {
        Instant::now() >= self.expires_at
    }
}

/// Thread-safe TTL cache for Soroban contract definitions and footprint schemas.
///
/// Speeds up gasless smart-contract mint validation by avoiding repeated
/// Horizon/RPC lookups for contracts already seen in the current TTL window.
pub struct ContractCache {
    definitions: Arc<Mutex<HashMap<String, CacheEntry<ContractDefinition>>>>,
    footprints: Arc<Mutex<HashMap<String, CacheEntry<FootprintSchema>>>>,
    ttl: Duration,
}

impl ContractCache {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            definitions: Arc::new(Mutex::new(HashMap::new())),
            footprints: Arc::new(Mutex::new(HashMap::new())),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    pub async fn get_definition(&self, contract_id: &str) -> Option<ContractDefinition> {
        let guard = self.definitions.lock().await;
        guard
            .get(contract_id)
            .filter(|e| !e.is_expired())
            .map(|e| e.value.clone())
    }

    pub async fn set_definition(&self, definition: ContractDefinition) {
        let contract_id = definition.contract_id.clone();
        let mut guard = self.definitions.lock().await;
        guard.insert(contract_id.clone(), CacheEntry::new(definition, self.ttl));
        info!("[ContractCache] Cached definition for contract {}", contract_id);
    }

    pub async fn get_footprint(&self, contract_id: &str) -> Option<FootprintSchema> {
        let guard = self.footprints.lock().await;
        guard
            .get(contract_id)
            .filter(|e| !e.is_expired())
            .map(|e| e.value.clone())
    }

    pub async fn set_footprint(&self, footprint: FootprintSchema) {
        let contract_id = footprint.contract_id.clone();
        let mut guard = self.footprints.lock().await;
        guard.insert(contract_id.clone(), CacheEntry::new(footprint, self.ttl));
        info!("[ContractCache] Cached footprint for contract {}", contract_id);
    }

    pub async fn invalidate(&self, contract_id: &str) {
        let mut defs = self.definitions.lock().await;
        let mut foots = self.footprints.lock().await;
        defs.remove(contract_id);
        foots.remove(contract_id);
        info!("[ContractCache] Invalidated cache for contract {}", contract_id);
    }

    /// Remove all TTL-expired entries. Called periodically by the eviction task.
    pub async fn evict_expired(&self) {
        {
            let mut guard = self.definitions.lock().await;
            let before = guard.len();
            guard.retain(|_, entry| !entry.is_expired());
            let evicted = before - guard.len();
            if evicted > 0 {
                info!("[ContractCache] Evicted {} expired definition(s)", evicted);
            }
        }
        {
            let mut guard = self.footprints.lock().await;
            let before = guard.len();
            guard.retain(|_, entry| !entry.is_expired());
            let evicted = before - guard.len();
            if evicted > 0 {
                info!("[ContractCache] Evicted {} expired footprint(s)", evicted);
            }
        }
    }

    pub async fn definition_count(&self) -> usize {
        self.definitions.lock().await.len()
    }

    pub async fn footprint_count(&self) -> usize {
        self.footprints.lock().await.len()
    }
}

// ── HTTP request/response shapes ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct UpsertDefinitionRequest {
    pub contract_id: String,
    pub wasm_hash: String,
    pub network: String,
    pub wasm_bytes: Option<Vec<u8>>,
}

#[derive(Deserialize)]
pub struct UpsertFootprintRequest {
    pub contract_id: String,
    pub read_only: Vec<String>,
    pub read_write: Vec<String>,
}

#[derive(Serialize)]
pub struct ContractCacheStatsResponse {
    pub definition_count: usize,
    pub footprint_count: usize,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn sample_definition(id: &str) -> ContractDefinition {
        ContractDefinition {
            contract_id: id.to_string(),
            wasm_hash: "deadbeef1234".to_string(),
            network: "testnet".to_string(),
            wasm_bytes: None,
            cached_at_ms: 0,
        }
    }

    fn sample_footprint(id: &str) -> FootprintSchema {
        FootprintSchema {
            contract_id: id.to_string(),
            read_only: vec!["key_ro".to_string()],
            read_write: vec!["key_rw".to_string()],
            cached_at_ms: 0,
        }
    }

    #[tokio::test]
    async fn test_set_and_get_definition() {
        let cache = ContractCache::new(300);
        cache.set_definition(sample_definition("CA")).await;
        let result = cache.get_definition("CA").await.unwrap();
        assert_eq!(result.contract_id, "CA");
        assert_eq!(result.wasm_hash, "deadbeef1234");
    }

    #[tokio::test]
    async fn test_set_and_get_footprint() {
        let cache = ContractCache::new(300);
        cache.set_footprint(sample_footprint("CB")).await;
        let result = cache.get_footprint("CB").await.unwrap();
        assert_eq!(result.contract_id, "CB");
        assert_eq!(result.read_only, vec!["key_ro"]);
        assert_eq!(result.read_write, vec!["key_rw"]);
    }

    #[tokio::test]
    async fn test_cache_miss_returns_none() {
        let cache = ContractCache::new(300);
        assert!(cache.get_definition("missing").await.is_none());
        assert!(cache.get_footprint("missing").await.is_none());
    }

    #[tokio::test]
    async fn test_expired_entry_returns_none() {
        let cache = ContractCache::new(0);
        cache.set_definition(sample_definition("CEXP")).await;
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(cache.get_definition("CEXP").await.is_none());
    }

    #[tokio::test]
    async fn test_invalidate_clears_both_maps() {
        let cache = ContractCache::new(300);
        cache.set_definition(sample_definition("CINV")).await;
        cache.set_footprint(sample_footprint("CINV")).await;
        cache.invalidate("CINV").await;
        assert!(cache.get_definition("CINV").await.is_none());
        assert!(cache.get_footprint("CINV").await.is_none());
    }

    #[tokio::test]
    async fn test_evict_expired_removes_stale_entries() {
        let cache = ContractCache::new(0);
        cache.set_definition(sample_definition("S1")).await;
        cache.set_definition(sample_definition("S2")).await;
        cache.set_footprint(sample_footprint("S1")).await;
        tokio::time::sleep(Duration::from_millis(10)).await;
        cache.evict_expired().await;
        assert_eq!(cache.definition_count().await, 0);
        assert_eq!(cache.footprint_count().await, 0);
    }

    #[tokio::test]
    async fn test_overwrite_updates_existing_entry() {
        let cache = ContractCache::new(300);
        cache.set_definition(sample_definition("CUP")).await;
        cache
            .set_definition(ContractDefinition {
                contract_id: "CUP".to_string(),
                wasm_hash: "newhash".to_string(),
                network: "mainnet".to_string(),
                wasm_bytes: None,
                cached_at_ms: 0,
            })
            .await;
        let result = cache.get_definition("CUP").await.unwrap();
        assert_eq!(result.wasm_hash, "newhash");
        assert_eq!(result.network, "mainnet");
    }

    #[tokio::test]
    async fn test_invalidate_one_does_not_affect_others() {
        let cache = ContractCache::new(300);
        cache.set_definition(sample_definition("CA")).await;
        cache.set_definition(sample_definition("CB")).await;
        cache.invalidate("CA").await;
        assert!(cache.get_definition("CA").await.is_none());
        assert!(cache.get_definition("CB").await.is_some());
    }

    #[tokio::test]
    async fn test_definition_and_footprint_counts() {
        let cache = ContractCache::new(300);
        assert_eq!(cache.definition_count().await, 0);
        assert_eq!(cache.footprint_count().await, 0);
        cache.set_definition(sample_definition("C1")).await;
        cache.set_definition(sample_definition("C2")).await;
        cache.set_footprint(sample_footprint("C1")).await;
        assert_eq!(cache.definition_count().await, 2);
        assert_eq!(cache.footprint_count().await, 1);
    }
}
