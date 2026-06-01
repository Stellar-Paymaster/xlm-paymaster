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
            let age_seconds = now.saturating_sub(entry.created_at);
            if let Some(expiry) = entry.expiry {
                if now >= expiry {
                    println!(
                        "[BLOCKLIST] Expired block for {} (reason: {}, age={}s)",
                        key, entry.reason, age_seconds
                    );
                }
                return now < expiry;
            }
            println!(
                "[BLOCKLIST] Active permanent block for {} (reason: {}, age={}s)",
                key, entry.reason, age_seconds
            );
            return true;
        }
        false
    }
}