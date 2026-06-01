# Decoupled Notification Engine

## Overview

`fluid-server` routes all alert delivery through an isolated notification
engine that runs as a dedicated Tokio background task.  The hot request path
enqueues events on a bounded channel and returns immediately — backends
(Slack webhooks, future SMTP gateways, etc.) are invoked asynchronously with
no blocking impact on fee-bump throughput.

## Architecture

```
Request path
    │
    ▼
NotificationHandle::send(event)   ← non-blocking channel send
    │
    ▼  (bounded mpsc channel, capacity 256)
NotificationEngine (background Tokio task)
    ├── Backend::Webhook("slack")  → POST https://hooks.slack.com/...
    └── Backend::Webhook("...")    → additional backends
```

Source: `fluid-server/src/notifications/mod.rs`

## Adding a Backend

Register additional backends in `run()` inside `fluid-server/src/main.rs`:

```rust
let notification_engine = notification_engine.register(
    Backend::Webhook(WebhookBackend::new("pagerduty", pagerduty_url))
);
```

Adding a new delivery channel means adding a variant to the `Backend` enum in
`notifications/mod.rs` and a corresponding `deliver` arm in the `match`
statement — no trait objects or dynamic dispatch required.

## Configuration

| Environment variable | Description                                    |
|----------------------|------------------------------------------------|
| `SLACK_WEBHOOK_URL`  | Slack incoming webhook URL (optional)          |

When `SLACK_WEBHOOK_URL` is unset the engine starts with zero backends and
silently drops events (safe for local development).

## Dispatching an Event

```rust
if let Some(handle) = &state.notification_handle {
    handle.send(NotificationEvent {
        id: uuid::Uuid::new_v4().to_string(),
        severity: NotificationSeverity::Warning,
        title: "Low balance".to_string(),
        message: format!("Account {} is below threshold", public_key),
        metadata: None,
    }).await;
}
```

## Back-pressure

The channel capacity is 256 events.  If the engine falls behind (e.g. a
backend is slow), `NotificationHandle::send` will await until a slot is free.
A `WARN` log is emitted if the send fails (e.g. the engine has shut down).
