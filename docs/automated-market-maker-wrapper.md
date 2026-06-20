# Automated Market Maker (AMM) Wrapper

The AMM Wrapper enables gasless token swaps on Soroban-based AMM contracts. By routing swap calls through XLM Paymaster, developers can sponsor transaction fee costs for their end-users.

## Capabilities

1. **Unsigned Transaction Construction**:
   - Generates the transaction payload (`xdr`) containing a Soroban `invokeHostFunction` invocation targeting the specified AMM's `swap` method.
2. **Gasless Fee Sponsorship**:
   - Sponsors the built transaction with Stellar fee payers using the standard fee-bump architecture.
3. **Soroban Preflight Integration**:
   - Integrates with the preflight pre-simulation steps to ensure the transaction will execute without reverting before signing.

## Endpoint

### `POST /admin/amm/swap`

Allows clients to construct or process an AMM swap transaction.

#### Request Body - Build Swap
```json
{
  "ammContractId": "CCW...",
  "userPublicKey": "GBXX...",
  "tokenA": "GAAA...",
  "tokenB": "GMMM...",
  "amount": "10000",
  "minAmountOut": "9900"
}
```

#### Response
```json
{
  "xdr": "AAAAAg...",
  "status": "ready",
  "message": "Unsigned swap transaction built successfully. Sign the XDR and submit it to process the swap."
}
```
