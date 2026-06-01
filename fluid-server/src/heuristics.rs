use std::collections::HashMap;

pub struct RequestTracker {
    map: HashMap<String, Vec<u64>>,
}

impl RequestTracker {
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
        }
    }

    pub fn is_suspicious(&mut self, key: &str, now: u64) -> bool {
        let timestamps = self.map.entry(key.to_string()).or_default();

        timestamps.retain(|&t| now - t < 10);
        timestamps.push(now);

        // Rule 1: spam
        if timestamps.len() > 5 {
            return true;
        }

        // Rule 2: burst activity
        if timestamps.len() >= 3 && (timestamps.last().unwrap() - timestamps[0]) < 3 {
            return true;
        }

        false
    }
}