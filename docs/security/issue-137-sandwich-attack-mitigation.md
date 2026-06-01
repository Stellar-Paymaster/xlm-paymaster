# Issue #137: Sandwich Attack Mitigation for Fee Settlement

## Summary

This mitigation adds a rule-based settlement analyzer to the Stellar fee sponsorship flow and enforces exact-value settlement semantics.

## Strategy

The implementation protects the Fluid fee settlement path in two stages:

1. Settlement validation
   - A settlement payment must target the configured fee payer.
   - The transaction must contain exactly one settlement operation.
   - Settlement must deliver the exact expected amount.
   - Path-based settlement must use `pathPaymentStrictReceive`, not `pathPaymentStrictSend`.

2. Sandwich-pattern analysis
   - The analyzer identifies the settlement operation inside the inner transaction.
   - It inspects the operations immediately before and after settlement.
   - It flags the transaction when the settlement is bracketed by trade-like or liquidity-pool operations touching the settlement asset.
   - It records softer warnings for one-sided adjacent trade activity so ordinary multi-step dApp flows are not blocked by default.

## Heuristics Implemented

- Reject if there is no fee settlement operation.
- Reject if there are multiple fee settlement operations.
- Reject if the settlement uses `pathPaymentStrictSend`.
- Reject if the settlement amount differs from the expected amount.
- Reject if trade-like activity appears immediately before and after the settlement.
- Reject if settlement is adjacent to a liquidity-pool leg combined with a trade leg in the opposite direction.
- Warn, but do not reject, when only one side of the settlement has nearby trade activity.

## Tradeoffs

- This is intentionally conservative and rule-based; it targets high-confidence sandwich patterns instead of attempting full MEV classification.
- Legitimate multi-step transactions are still allowed when they do not exhibit a clear before-and-after manipulation pattern.
- Liquidity-pool operations are treated as suspicious when directly adjacent because they can alter local execution conditions even without a full orderbook trail.

## Files

- `server/src/utils/settlementTransactionAnalyzer.ts`
- `server/src/utils/settlementVerifier.ts`
- `server/src/sponsors/stellar.ts`
- `server/src/utils/settlementTransactionAnalyzer.test.ts`
- `server/src/utils/settlementVerifier.test.ts`
