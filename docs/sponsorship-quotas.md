# Sponsorship Quotas

Fluid enforces per-tenant sponsorship quotas to ensure predictable fee sponsorship and avoid runaway XLM spend.

## What is enforced

- `dailyQuotaStroops`: the maximum amount of sponsored fee spend allowed per tenant per UTC day.
- `txLimit`: the maximum number of sponsored transactions allowed per tenant per UTC day.

## How quota enforcement works

- The server tracks each sponsored Stellar fee bump in `sponsoredTransaction`.
- Quota checks compare the tenant's current daily spend and transaction count against the configured daily quota and transaction limit.
- Quota enforcement applies to both:
  - `POST /fee-bump`
  - `POST /fee-bump/batch`

## Batch request behavior

- `POST /fee-bump/batch` performs a cumulative quota check for all requested XDRs.
- The server computes the total projected fee spend and total transaction count for the batch before any sponsorship is created.
- If the batch would exceed either the daily spend quota or the daily transaction limit, the server rejects the request with `QUOTA_EXCEEDED`.

## Error response

When a quota is exceeded, Fluid returns a 403 error with a machine-readable code:

```json
{
  "error": "Tier limit exceeded. Spend 900000/1000000 stroops and transactions 10/10 today.",
  "code": "QUOTA_EXCEEDED"
}
```

## Developer notes

- Quotas are enforced using UTC calendar days.
- Per-tenant quota values are sourced from tenant API key configuration and can be updated by billing/top-up workflows.
- `sponsoredTransaction` history is the trusted source of truth for daily quota reconciliation.
