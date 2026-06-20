# Log Aggregation Integration

## Overview

The server now supports production log aggregation exports with provider presets for:

- DataDog
- ELK (Elasticsearch Bulk API)
- New Relic

Integration is configured by environment variables and is resilient by default:

- Console logging always remains available.
- Export failures do not crash request handling.
- Export uses bounded queues and batched delivery to control memory and network overhead.

## Technical Design

### Components

1. Structured Event Capture
- A custom tracing layer captures events and serializes fields into JSON.
- Each record includes timestamp, level, target, service name, and structured fields.

2. Bounded In-Memory Queue
- A bounded async channel prevents unbounded memory growth.
- Overflow behavior drops excess records and emits a warning.

3. Batched Export Worker
- A background Tokio task flushes logs by either:
  - batch size threshold, or
  - periodic flush interval.
- Provider-specific payload formats are produced:
  - DataDog and New Relic: JSON array payload
  - ELK: NDJSON bulk format

4. Provider Validation and Safe Defaults
- Provider-specific defaults and required fields are validated at startup.
- Invalid aggregation configuration falls back to console logging.

### Security and Reliability Controls

- Endpoint URL validation: only http/https endpoints are allowed.
- API key enforcement for DataDog and New Relic providers.
- Field value size capping to avoid oversized payloads.
- Request timeout controls for exporter HTTP calls.
- Batching and flush interval clamps to avoid abusive resource usage.

## Configuration

| Variable | Description | Default |
|---|---|---|
| FLUID_LOG_AGGREGATION_PROVIDER | disabled, datadog, elk, newrelic | disabled |
| FLUID_LOG_AGGREGATION_ENDPOINT | Override endpoint URL | Provider default |
| FLUID_LOG_AGGREGATION_API_KEY | Required for datadog/newrelic | none |
| FLUID_LOG_AGGREGATION_BATCH_SIZE | Batch size for export worker | 50 |
| FLUID_LOG_AGGREGATION_FLUSH_MS | Flush interval in milliseconds | 3000 |
| FLUID_LOG_AGGREGATION_TIMEOUT_MS | HTTP timeout in milliseconds | 5000 |
| FLUID_LOG_AGGREGATION_ELK_INDEX | Bulk index name for ELK | fluid-server-logs |
| FLUID_SERVICE_NAME | Service name attached to records | fluid-server |

### Provider Presets

- DataDog endpoint default:
  - https://http-intake.logs.datadoghq.com/api/v2/logs
  - Header: DD-API-KEY
- ELK endpoint default:
  - http://localhost:9200/_bulk
  - Content-Type: application/x-ndjson
- New Relic endpoint default:
  - https://log-api.newrelic.com/log/v1
  - Header: Api-Key

## Runtime Behavior

- Provider disabled:
  - Standard console logging via tracing subscriber.
- Provider enabled:
  - JSON console logging remains active.
  - Aggregation layer forwards structured events to background exporter.
  - Errors in export path are isolated and non-fatal.

## Testing Strategy

- Unit tests in logging module cover:
  - provider parsing aliases
  - required key validation
  - endpoint validation
  - DataDog payload encoding
  - ELK bulk NDJSON encoding
- Integration tests cover:
  - env-driven config parsing
  - default endpoint selection
  - config edge-case clamping
  - required key enforcement for New Relic
