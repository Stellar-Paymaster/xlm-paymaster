# Fluid vs Manual Fee Management

A detailed, honest comparison of using Fluid against implementing fee-bump transactions by hand.

---

## Comparison table

| Dimension | Manual fee-bump | Fluid |
|---|---|---|
| **Setup complexity** | High — write signing logic, key management, submission retry, and error handling from scratch | Low — one `npm install`, one server deploy |
| **Lines of code (per integration)** | ~150–300 (see code comparison below) | ~10–15 |
| **Fee accuracy** | Error-prone — static `base_fee` gets congested during surges; manual multiplier tuning required | Automatic — `FLUID_FEE_MULTIPLIER` applies dynamically; Horizon failover keeps submissions alive |
| **Key security** | Fee-payer secret in application code or env; rotation requires code deploy | Secret isolated in the Fluid server process; rotated by updating one env var |
| **Horizon failover** | Not included — single-endpoint submissions fail silently during outages | Built-in — `FLUID_HORIZON_URLS` + `FLUID_HORIZON_SELECTION=priority` retries automatically |
| **Rate limiting** | None — fee-payer can be drained by runaway clients | Configurable per-route via `FLUID_RATE_LIMIT_MAX` and `FLUID_RATE_LIMIT_WINDOW_MS` |
| **Multi-tenant support** | Requires custom routing + per-tenant key management | Tenant isolation via API keys with per-tenant billing (Phase 9+) |
| **Multi-asset support** | XLM only (native fee currency) | XLM today; designed for multi-chain extension (see ADR-001) |
| **Observability** | Custom logging required | Prometheus metrics at `/metrics`, Grafana dashboards, Slack/email alerts |
| **Balance monitoring** | Manual cron job | Built-in low-balance alerts (`FLUID_LOW_BALANCE_THRESHOLD_XLM`) |
| **Scalability** | Sequence-number contention beyond ~10 TPS | Horizontal scaling via managed accounts + load balancing (see `docker-compose.scale.yml`) |
| **Maintenance burden** | High — owned entirely by the integrator | Low — community-maintained, versioned releases |

---

## Code comparison

### Manual fee-bump (Node.js / TypeScript)

A production-ready manual implementation requires error handling, retries, Horizon failover, and sequence number management:

```ts
// ~200 lines to do what Fluid does out of the box
import {
  Keypair, Server, TransactionBuilder, FeeBumpTransaction,
  Transaction, Networks
} from "@stellar/stellar-sdk";

const FEE_PAYER_SECRET = process.env.FEE_PAYER_SECRET!;   // stored in app env
const BASE_FEE         = parseInt(process.env.BASE_FEE ?? "100", 10);
const MULTIPLIER       = parseFloat(process.env.FEE_MULTIPLIER ?? "2.0");
const HORIZON_URLS     = (process.env.HORIZON_URLS ?? "https://horizon-testnet.stellar.org").split(",");

const feePayerKp = Keypair.fromSecret(FEE_PAYER_SECRET);

async function manualFeeBump(signedInnerXdr: string): Promise<string> {
  const innerTx = TransactionBuilder.fromXDR(signedInnerXdr, Networks.TESTNET) as Transaction;

  // ── Fee calculation ──────────────────────────────────────────────────────
  // Must manually estimate fee based on current network load.
  // Gets stale during congestion — requires tuning.
  const fee = String(Math.round(BASE_FEE * MULTIPLIER * innerTx.operations.length));

  const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
    feePayerKp,
    fee,
    innerTx,
    Networks.TESTNET
  );
  feeBumpTx.sign(feePayerKp);
  const feeBumpXdr = feeBumpTx.toXDR();

  // ── Horizon failover — must implement yourself ───────────────────────────
  let lastError: Error | null = null;
  for (const url of HORIZON_URLS) {
    try {
      const server = new Server(url);
      const result = await server.submitTransaction(
        TransactionBuilder.fromXDR(feeBumpXdr, Networks.TESTNET) as FeeBumpTransaction
      );
      return result.hash;
    } catch (err: any) {
      lastError = err;
      // Log and try next node
      console.error(`Horizon ${url} failed:`, err.response?.data ?? err.message);
    }
  }

  // ── Retry logic — must implement yourself ────────────────────────────────
  // Exponential back-off, sequence number refresh, etc.
  throw lastError ?? new Error("All Horizon nodes failed");
}

// ── Balance monitoring — must implement yourself ─────────────────────────────
async function checkBalance() {
  const server = new Server(HORIZON_URLS[0]);
  const account = await server.loadAccount(feePayerKp.publicKey());
  const xlm = account.balances.find((b) => b.asset_type === "native");
  const balance = parseFloat(xlm?.balance ?? "0");
  if (balance < parseFloat(process.env.LOW_BALANCE_THRESHOLD ?? "50")) {
    // Send your own alert ...
    console.warn(`Low balance: ${balance} XLM`);
  }
}

// ── Rate limiting — must implement yourself ───────────────────────────────────
// Add token-bucket logic here, or use a Redis-backed middleware...
```

### With Fluid (~10 lines)

```ts
import { FluidClient } from "fluid-client";

const fluid = new FluidClient({
  serverUrl:         "https://your-fluid-server.example.com",
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl:        "https://horizon-testnet.stellar.org",
});

// That's it — fee-payer key never touches application code
const { xdr } = await fluid.requestFeeBump(signedInnerXdr);
```

Fluid handles: fee calculation, Horizon failover, retries, balance monitoring, rate limiting, metrics, and key isolation — all via the server configuration.

---

## Total cost of ownership

| Cost driver | Manual | Fluid |
|---|---|---|
| Initial implementation | 2–5 engineer-days | < 1 hour |
| Ongoing maintenance | 2–4 hours/month (monitoring, fee tuning) | ~30 min/month (upgrade, config review) |
| Incident response | Owner's time for every Horizon outage | Community issue tracker |
| Infrastructure | App server env var + your own monitoring | Dedicated Fluid server (can share with other tenants) |
| Scaling beyond 10 TPS | Re-architect sequence number handling | Update `docker-compose.scale.yml` |

---

## When manual is the right choice

Manual fee-bumps remain appropriate when:

- You have a single, extremely low-volume integration (< 5 transactions/day) and no plans to scale.
- You need fine-grained control over the fee-payer keypair lifecycle that conflicts with Fluid's server model.
- Your organisation prohibits running additional services.

In all other cases, Fluid reduces risk and maintenance burden significantly.

---

## Further reading

- [Fluid README](../README.md) — quick-start and configuration reference
- [ADR-001: Chain-agnostic fee sponsor](adr/001-chain-agnostic-fee-sponsor.md)
- [Stellar fee-bump transaction documentation](https://developers.stellar.org/docs/encyclopedia/fee-bump-transactions)
