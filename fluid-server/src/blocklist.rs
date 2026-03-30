use std::collections::HashMap;

#[derive(Clone)]
pub struct BlockEntry {
    pub reason: String,
    pub expiry: Option<u64>,
    pub created_at: u64,
}

pub struct Blocklist {
    entries: HashMap<String, BlockEntry>,
}

impl Blocklist {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    pub fn add(&mut self, key: String, reason: String, now: u64) {
        println!("[BLOCKLIST] {} → {}", key, reason);

        self.entries.insert(
            key,
            BlockEntry {
                reason,
                expiry: Some(now + 3600), // 1 hour expiry
                created_at: now,
            },
        );
    }

    pub fn is_blocked(&self, key: &str, now: u64) -> bool {
        if let Some(entry) = self.entries.get(key) {
            if let Some(expiry) = entry.expiry {
                return now < expiry;
            }
            return true;
        }
        false
    }
}
