use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Represents a rate limit window for a specific key
#[derive(Clone)]
struct RateLimitWindow {
    requests: Vec<u64>, // timestamps in milliseconds
    limit: u64,
    window_ms: u64,
}

impl RateLimitWindow {
    fn new(limit: u64, window_ms: u64) -> Self {
        RateLimitWindow {
            requests: Vec::new(),
            limit,
            window_ms,
        }
    }

    fn is_allowed(&mut self, now: u64) -> bool {
        // Remove old requests outside the window
        self.requests
            .retain(|&timestamp| now - timestamp < self.window_ms);

        if self.requests.len() < self.limit as usize {
            self.requests.push(now);
            true
        } else {
            false
        }
    }
}

/// Thread-safe rate limiter using sliding window algorithm
pub struct RateLimiter {
    windows: Arc<RwLock<HashMap<String, RateLimitWindow>>>,
    default_limit: u64,
    default_window_ms: u64,
}

impl RateLimiter {
    /// Creates a new rate limiter with default limits
    /// - limit: maximum requests per window
    /// - window_ms: time window in milliseconds
    pub fn new(limit: u64, window_ms: u64) -> Self {
        RateLimiter {
            windows: Arc::new(RwLock::new(HashMap::new())),
            default_limit: limit,
            default_window_ms: window_ms,
        }
    }

    /// Check if a request from the given key is allowed
    pub async fn is_allowed(&self, key: &str) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let mut windows = self.windows.write().await;
        let window = windows
            .entry(key.to_string())
            .or_insert_with(|| RateLimitWindow::new(self.default_limit, self.default_window_ms));

        window.is_allowed(now)
    }

    /// Check if a request is allowed with custom limits
    pub async fn is_allowed_with_limits(
        &self,
        key: &str,
        limit: u64,
        window_ms: u64,
    ) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let mut windows = self.windows.write().await;
        let window = windows
            .entry(key.to_string())
            .or_insert_with(|| RateLimitWindow::new(limit, window_ms));

        // Update limits if they changed
        if window.limit != limit || window.window_ms != window_ms {
            *window = RateLimitWindow::new(limit, window_ms);
        }

        window.is_allowed(now)
    }

    /// Get current request count for a key
    pub async fn get_request_count(&self, key: &str) -> u64 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let mut windows = self.windows.write().await;
        if let Some(window) = windows.get_mut(key) {
            // Remove old requests
            window
                .requests
                .retain(|&timestamp| now - timestamp < window.window_ms);
            window.requests.len() as u64
        } else {
            0
        }
    }

    /// Reset rate limit for a key
    pub async fn reset(&self, key: &str) {
        let mut windows = self.windows.write().await;
        windows.remove(key);
    }

    /// Clear all rate limits
    pub async fn clear_all(&self) {
        let mut windows = self.windows.write().await;
        windows.clear();
    }

    /// Get number of tracked keys
    pub async fn get_tracked_keys_count(&self) -> usize {
        let windows = self.windows.read().await;
        windows.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter_allows_under_limit() {
        let limiter = RateLimiter::new(5, 1000); // 5 requests per 1000ms

        for _ in 0..5 {
            assert!(limiter.is_allowed("test-key").await);
        }
    }

    #[tokio::test]
    async fn test_rate_limiter_blocks_over_limit() {
        let limiter = RateLimiter::new(2, 1000); // 2 requests per 1000ms

        assert!(limiter.is_allowed("test-key").await);
        assert!(limiter.is_allowed("test-key").await);
        assert!(!limiter.is_allowed("test-key").await);
    }

    #[tokio::test]
    async fn test_rate_limiter_different_keys() {
        let limiter = RateLimiter::new(2, 1000);

        assert!(limiter.is_allowed("key1").await);
        assert!(limiter.is_allowed("key1").await);
        assert!(limiter.is_allowed("key2").await);
        assert!(limiter.is_allowed("key2").await);

        assert!(!limiter.is_allowed("key1").await);
        assert!(!limiter.is_allowed("key2").await);
    }

    #[tokio::test]
    async fn test_rate_limiter_custom_limits() {
        let limiter = RateLimiter::new(5, 1000);

        assert!(limiter.is_allowed_with_limits("custom-key", 2, 1000).await);
        assert!(limiter.is_allowed_with_limits("custom-key", 2, 1000).await);
        assert!(!limiter.is_allowed_with_limits("custom-key", 2, 1000).await);
    }

    #[tokio::test]
    async fn test_rate_limiter_get_request_count() {
        let limiter = RateLimiter::new(10, 1000);

        limiter.is_allowed("count-key").await;
        limiter.is_allowed("count-key").await;
        limiter.is_allowed("count-key").await;

        let count = limiter.get_request_count("count-key").await;
        assert_eq!(count, 3);
    }

    #[tokio::test]
    async fn test_rate_limiter_reset() {
        let limiter = RateLimiter::new(2, 1000);

        limiter.is_allowed("reset-key").await;
        limiter.is_allowed("reset-key").await;
        assert!(!limiter.is_allowed("reset-key").await);

        limiter.reset("reset-key").await;
        assert!(limiter.is_allowed("reset-key").await);
    }

    #[tokio::test]
    async fn test_rate_limiter_clear_all() {
        let limiter = RateLimiter::new(2, 1000);

        limiter.is_allowed("key1").await;
        limiter.is_allowed("key2").await;

        limiter.clear_all().await;

        assert_eq!(limiter.get_tracked_keys_count().await, 0);
    }

    #[tokio::test]
    async fn test_rate_limiter_tracked_keys_count() {
        let limiter = RateLimiter::new(10, 1000);

        limiter.is_allowed("key1").await;
        limiter.is_allowed("key2").await;
        limiter.is_allowed("key3").await;

        assert_eq!(limiter.get_tracked_keys_count().await, 3);
    }
}
