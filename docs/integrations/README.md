# Fluid Integration Guides for Stellar Ecosystem Projects

Step-by-step guides for adding gasless transactions to popular Stellar ecosystem projects.

## Available Guides

| Project | Use case | Guide |
|---|---|---|
| [Soroswap](https://soroswap.finance) | Gasless token swaps on the DEX | [soroswap.md](./soroswap.md) |
| [Blend Protocol](https://blend.capital) | Gasless lending (supply, borrow, repay, withdraw) | [blend-protocol.md](./blend-protocol.md) |
| NFT projects | Gasless minting pattern | [nft-gasless-minting.md](./nft-gasless-minting.md) |

## Common Pattern

Every integration follows the same three steps regardless of the target protocol:

```
1. Build the inner transaction using the target protocol's SDK
2. Sign with the user's wallet (Freighter, Albedo, Lobstr, etc.)
3. Send the signed XDR to fluid.requestFeeBump() and submit the result
```

The user's signature is on the **inner** transaction; the fee-payer's signature is on the **outer** fee-bump envelope. The two signatures are independent — the inner transaction is cryptographically unmodified by Fluid.

## Adding Your Own Integration Guide

1. Copy [`docs/adr/template.md`](../adr/template.md) as a starting point, or use the pattern above.
2. Include a complete working code example (TypeScript preferred).
3. Document any relevant configuration knobs (`FLUID_RATE_LIMIT_MAX`, `FLUID_FEE_MULTIPLIER`, etc.).
4. Open a PR targeting `main`.
