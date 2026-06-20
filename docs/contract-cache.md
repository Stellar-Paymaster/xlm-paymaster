# Soroban Smart Contract Cache

## Overview

`paymaster-server` maintains an in-process TTL cache for Soroban smart-contract
definitions and ledger footprint schemas.  Caching these properties avoids
repeated Horizon/RPC round-trips during gasless smart-contract mint validation,
reducing median validation latency.

## Architecture

```
POST /contract/definition   →  ContractCache::set_definition
POST /contract/footprint    →  ContractCache::set_footprint
GET  /contract/cache/stats  →  ContractCache::{definition,footprint}_count

Background task (every 60 s)  →  ContractCache::evict_expired
```

The cache lives in `paymaster-server/src/contract_cache.rs` and is owned by
`AppState`.  Each entry carries an `Instant`-based expiry so expired entries
are invisible to readers immediately and are physically removed by the
background eviction task.

## Configuration

| Environment variable     | Default | Description                      |
|--------------------------|---------|----------------------------------|
| `CONTRACT_CACHE_TTL_SECS`| `300`   | Time-to-live for cache entries   |

## API

### `POST /contract/definition`

Store or update a contract WASM definition.

**Request body**
```json
{
  "contract_id": "CABC...",
  "wasm_hash": "deadbeef...",
  "network": "testnet",
  "wasm_bytes": null
}
```

**Response** — the stored `ContractDefinition` with a `cached_at_ms` timestamp.

### `POST /contract/footprint`

Store or update a contract footprint schema.

**Request body**
```json
{
  "contract_id": "CABC...",
  "read_only":  ["ledger_key_1"],
  "read_write": ["ledger_key_2"]
}
```

**Response** — the stored `FootprintSchema`.

### `GET /contract/cache/stats`

Returns current cache sizes.

```json
{ "definition_count": 12, "footprint_count": 8 }
```

## Security

Contract cache endpoints are unauthenticated by design — they store
non-sensitive public metadata (hashes and key names).  Operators that need
write protection should place a reverse proxy with IP allowlisting in front of
these routes.
