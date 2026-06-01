# Stellar Asset Auto-Swap

## Overview
This feature automatically converts tenant fees from various Stellar assets into XLM on the fly, ensuring a uniform reserve of the native asset.

## Implementation
The `StellarAutoSwapService` intercepts incoming fee payments and checks their asset type. If the asset is not XLM, it interfaces with a decentralized exchange to swap the assets into XLM.

## Edge Cases Handled
- Bypasses the swap mechanism entirely if the incoming asset is already XLM.
- Gracefully handles DEX transaction failures and logs them for review.
