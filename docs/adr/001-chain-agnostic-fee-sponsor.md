# ADR 001: Chain-Agnostic Fee Sponsor Interface

## Status
Accepted

## Context
Fluid was originally built with a hard dependency on the Stellar network. Expanding to other chains like EVM (Ethereum, etc.) and Solana would require significant rework if the Stellar-specific logic remained coupled to the core API handlers.

## Decision
We will abstract the fee-sponsorship logic into a `FeeSponsor` interface. This interface defines the core operations required for a "gasless" layer:
1. `estimateFee`: Calculate the cost of sponsorship.
2. `buildSponsoredTx`: Wrap or modify a transaction to include the fee-payer's signature.

A `SponsorFactory` will be used to instantiate the correct implementation based on the `chainId` provided in the request.

## Consequences
- **Pros**:
    - Easy to add new chains without touching core routing logic.
    - Standardized response format across ecosystems.
    - Clear separation of concerns between API handling and chain-specific cryptography/protocols.
- **Cons**:
    - Slightly more complex codebase due to abstraction.
    - Need to maintain backward compatibility for Stellar-only clients.
