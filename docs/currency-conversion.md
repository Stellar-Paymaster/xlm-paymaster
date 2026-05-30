# Currency Conversion Service for Top-ups

The `CurrencyConversionService` handles automatic conversion of local fiat currencies (USD, EUR, GBP, BRL, NGN) to XLM for tenant balance deposits.

## Features

1. **Exchange Rate Fetching**: Automatically fetches the current price of XLM (Stellar) from the CoinGecko pricing API.
2. **Offline Fallback**: If external API calls fail (e.g. network timeout or server errors), the service falls back to default rates to ensure the application remains functional.
3. **Graceful Rate Limit Handling**: Detects `429 Too Many Requests` API statuses, logs a warning, and falls back to default/cached rates instead of throwing an error.
4. **Input Validation**: Ensures that only supported fiat currencies are allowed, and checks that deposit amounts are strictly positive.
5. **Decimals and Rounding**: Stellar represents asset balances in Stroops (representing 7 decimal places, where $1\text{ XLM} = 10^7\text{ Stroops}$). The service computes the exact Stroop amount using precise rounding.
