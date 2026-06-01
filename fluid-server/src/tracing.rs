/// Distributed tracing integration (Issue #709)
///
/// Provides OpenTelemetry-compatible span context propagation and structured
/// trace IDs that flow through the fee-bump pipeline: inbound HTTP request →
/// fee calculation → Horizon submission → response.
///
/// The implementation is intentionally zero-dependency on the full OTEL SDK
/// (which would pull in a large dependency tree incompatible with the WASM
/// target).  Instead we:
///   1. Generate a W3C-compatible `traceparent` header value.
///   2. Attach trace/span IDs to every `tracing` span so they appear in logs.
///   3. Expose helpers for extracting/injecting context across HTTP boundaries.
use std::fmt;

use uuid::Uuid;

// ---------------------------------------------------------------------------
// Trace / Span ID types
// ---------------------------------------------------------------------------

/// A 128-bit trace identifier (W3C traceparent format).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TraceId(pub [u8; 16]);

/// A 64-bit span identifier (W3C traceparent format).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpanId(pub [u8; 8]);

impl TraceId {
    /// Generate a new random trace ID.
    pub fn new() -> Self {
        let id = Uuid::new_v4();
        Self(*id.as_bytes())
    }

    /// Parse from a 32-character lowercase hex string.
    pub fn from_hex(s: &str) -> Option<Self> {
        if s.len() != 32 {
            return None;
        }
        let mut bytes = [0u8; 16];
        for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
            let hi = hex_nibble(chunk[0])?;
            let lo = hex_nibble(chunk[1])?;
            bytes[i] = (hi << 4) | lo;
        }
        Some(Self(bytes))
    }

    pub fn to_hex(&self) -> String {
        self.0.iter().fold(String::with_capacity(32), |mut s, b| {
            use fmt::Write;
            let _ = write!(s, "{b:02x}");
            s
        })
    }
}

impl Default for TraceId {
    fn default() -> Self {
        Self::new()
    }
}

impl SpanId {
    /// Generate a new random span ID.
    pub fn new() -> Self {
        let id = Uuid::new_v4();
        let bytes = id.as_bytes();
        Self([
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        ])
    }

    /// Parse from a 16-character lowercase hex string.
    pub fn from_hex(s: &str) -> Option<Self> {
        if s.len() != 16 {
            return None;
        }
        let mut bytes = [0u8; 8];
        for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
            let hi = hex_nibble(chunk[0])?;
            let lo = hex_nibble(chunk[1])?;
            bytes[i] = (hi << 4) | lo;
        }
        Some(Self(bytes))
    }

    pub fn to_hex(&self) -> String {
        self.0.iter().fold(String::with_capacity(16), |mut s, b| {
            use fmt::Write;
            let _ = write!(s, "{b:02x}");
            s
        })
    }
}

impl Default for SpanId {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// SpanContext — the propagated unit
// ---------------------------------------------------------------------------

/// Carries the W3C trace context for a single request.
#[derive(Clone, Debug)]
pub struct SpanContext {
    pub trace_id: TraceId,
    pub span_id: SpanId,
    /// Whether the trace is sampled (flag bit 01 in traceparent).
    pub sampled: bool,
}

impl SpanContext {
    /// Create a new root span context (no parent).
    pub fn new_root() -> Self {
        Self {
            trace_id: TraceId::new(),
            span_id: SpanId::new(),
            sampled: true,
        }
    }

    /// Create a child span that inherits the trace ID but gets a new span ID.
    pub fn child(&self) -> Self {
        Self {
            trace_id: self.trace_id.clone(),
            span_id: SpanId::new(),
            sampled: self.sampled,
        }
    }

    /// Encode as a W3C `traceparent` header value.
    ///
    /// Format: `00-<trace_id>-<span_id>-<flags>`
    pub fn to_traceparent(&self) -> String {
        format!(
            "00-{}-{}-{:02x}",
            self.trace_id.to_hex(),
            self.span_id.to_hex(),
            if self.sampled { 0x01u8 } else { 0x00u8 }
        )
    }

    /// Parse a W3C `traceparent` header value.
    ///
    /// Returns `None` for any malformed input; callers should fall back to
    /// `SpanContext::new_root()`.
    pub fn from_traceparent(value: &str) -> Option<Self> {
        let parts: Vec<&str> = value.splitn(4, '-').collect();
        if parts.len() != 4 {
            return None;
        }
        // version must be "00"
        if parts[0] != "00" {
            return None;
        }
        let trace_id = TraceId::from_hex(parts[1])?;
        let span_id = SpanId::from_hex(parts[2])?;
        let flags = u8::from_str_radix(parts[3], 16).ok()?;
        Some(Self {
            trace_id,
            span_id,
            sampled: (flags & 0x01) != 0,
        })
    }
}

// ---------------------------------------------------------------------------
// HTTP header helpers
// ---------------------------------------------------------------------------

pub const TRACEPARENT_HEADER: &str = "traceparent";
pub const TRACESTATE_HEADER: &str = "tracestate";

/// Extract a `SpanContext` from an Axum `HeaderMap`.  Falls back to a new
/// root context when the header is absent or malformed.
pub fn extract_span_context(headers: &axum::http::HeaderMap) -> SpanContext {
    headers
        .get(TRACEPARENT_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(SpanContext::from_traceparent)
        .unwrap_or_else(SpanContext::new_root)
}

/// Inject the `traceparent` header into an outgoing `reqwest::RequestBuilder`.
pub fn inject_traceparent(
    builder: reqwest::RequestBuilder,
    ctx: &SpanContext,
) -> reqwest::RequestBuilder {
    builder.header(TRACEPARENT_HEADER, ctx.to_traceparent())
}

// ---------------------------------------------------------------------------
// Tracing span helpers
// ---------------------------------------------------------------------------

/// Record trace/span IDs on the current `tracing` span so they appear in
/// structured log output.
pub fn record_trace_ids(ctx: &SpanContext) {
    tracing::Span::current().record("trace_id", ctx.trace_id.to_hex());
    tracing::Span::current().record("span_id", ctx.span_id.to_hex());
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trace_id_round_trips_through_hex() {
        let id = TraceId::new();
        let hex = id.to_hex();
        assert_eq!(hex.len(), 32);
        let parsed = TraceId::from_hex(&hex).expect("should parse");
        assert_eq!(id, parsed);
    }

    #[test]
    fn span_id_round_trips_through_hex() {
        let id = SpanId::new();
        let hex = id.to_hex();
        assert_eq!(hex.len(), 16);
        let parsed = SpanId::from_hex(&hex).expect("should parse");
        assert_eq!(id, parsed);
    }

    #[test]
    fn traceparent_round_trips() {
        let ctx = SpanContext::new_root();
        let header = ctx.to_traceparent();
        // W3C format: 00-<32hex>-<16hex>-01
        assert!(header.starts_with("00-"));
        assert_eq!(header.len(), 55); // "00-" + 32 + "-" + 16 + "-" + 2

        let parsed = SpanContext::from_traceparent(&header).expect("should parse");
        assert_eq!(parsed.trace_id, ctx.trace_id);
        assert_eq!(parsed.span_id, ctx.span_id);
        assert!(parsed.sampled);
    }

    #[test]
    fn traceparent_unsampled_flag() {
        let mut ctx = SpanContext::new_root();
        ctx.sampled = false;
        let header = ctx.to_traceparent();
        assert!(header.ends_with("-00"));
        let parsed = SpanContext::from_traceparent(&header).unwrap();
        assert!(!parsed.sampled);
    }

    #[test]
    fn child_inherits_trace_id() {
        let root = SpanContext::new_root();
        let child = root.child();
        assert_eq!(root.trace_id, child.trace_id);
        assert_ne!(root.span_id, child.span_id);
    }

    #[test]
    fn from_traceparent_rejects_malformed_input() {
        assert!(SpanContext::from_traceparent("").is_none());
        assert!(SpanContext::from_traceparent("00-badhex-badhex-01").is_none());
        assert!(SpanContext::from_traceparent(
            "01-00000000000000000000000000000000-0000000000000000-01"
        )
        .is_none());
    }

    #[test]
    fn from_traceparent_rejects_wrong_version() {
        // version "01" is not supported
        let ctx = SpanContext::new_root();
        let bad = format!("01-{}-{}-01", ctx.trace_id.to_hex(), ctx.span_id.to_hex());
        assert!(SpanContext::from_traceparent(&bad).is_none());
    }

    #[test]
    fn trace_id_from_hex_rejects_wrong_length() {
        assert!(TraceId::from_hex("abc").is_none());
        assert!(TraceId::from_hex(&"a".repeat(33)).is_none());
    }

    #[test]
    fn span_id_from_hex_rejects_wrong_length() {
        assert!(SpanId::from_hex("abc").is_none());
        assert!(SpanId::from_hex(&"a".repeat(17)).is_none());
    }
}
