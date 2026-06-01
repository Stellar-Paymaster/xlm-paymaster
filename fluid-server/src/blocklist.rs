use std::collections::HashMap;

/// Normalise an address for blocklist lookups.
///
/// Muxed accounts (M...) share the same underlying ed25519 key as their base
/// G... account.  To avoid bypassing a block by using a muxed variant, we
/// resolve M... addresses to their base G... key before storing or checking.
///
/// If the address cannot be parsed as a muxed account it is returned as-is,
/// so plain G... addresses and any other strings pass through unchanged.
fn normalize_address(address: &str) -> String {
    use stellar_strkey::Strkey;
    use stellar_strkey::ed25519::PublicKey;

    // Attempt to parse as a muxed account (M...).
    if let Ok(Strkey::MuxedAccountEd25519(muxed)) = Strkey::from_string(address) {
        // Return the underlying G... account id.
        return Strkey::PublicKeyEd25519(PublicKey(muxed.ed25519)).to_string();
    }

    address.to_string()
}

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
        let normalized = normalize_address(&key);
        println!("[BLOCKLIST] {} → {}", normalized, reason);

        self.entries.insert(
            normalized,
            BlockEntry {
                reason,
                expiry: Some(now + 3600), // 1 hour expiry
                created_at: now,
            },
        );
    }

    pub fn is_blocked(&self, key: &str, now: u64) -> bool {
        let normalized = normalize_address(key);
        if let Some(entry) = self.entries.get(&normalized) {
            let age_seconds = now.saturating_sub(entry.created_at);
            if let Some(expiry) = entry.expiry {
                if now >= expiry {
                    println!(
                        "[BLOCKLIST] Expired block for {} (reason: {}, age={}s)",
                        normalized, entry.reason, age_seconds
                    );
                }
                return now < expiry;
            }
            println!(
                "[BLOCKLIST] Active permanent block for {} (reason: {}, age={}s)",
                normalized, entry.reason, age_seconds
            );
            return true;
        }
        false
    }
}