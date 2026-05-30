# Asset Whitelist Editor

## Overview

The Asset Whitelist Editor is a dashboard UI component designed to manage the list of sponsored and allowed tokens (e.g., USDC, XLM, custom assets) on the Fluid platform. It provides operators with granular control over which assets are supported and whether transaction fees for those assets are sponsored.

## Design

### Data Structure
Each whitelisted asset has the following properties:
- `id`: A unique identifier for the list item.
- `code`: The asset code (e.g., `USDC`, `XLM`).
- `issuer`: The Stellar public key of the issuer, or `native` for XLM.
- `sponsored`: A boolean flag determining if the asset's transaction fees are sponsored.

### Component Features
1. **Adding Assets**: Operators can add new assets by specifying the Asset Code and Issuer Public Key. Native assets can omit the issuer (defaults to `native`).
2. **Duplicate Prevention**: The UI actively prevents adding identical `(code, issuer)` pairs to avoid system conflicts.
3. **Sponsorship Toggling**: A quick-toggle switch allows operators to enable or disable sponsorship for an asset instantly.
4. **Dark Mode & Accessibility**: 
   - Form inputs and action buttons utilize ARIA labels for screen reader compatibility.
   - Focus states are strictly defined using active ring tokens (`focus:ring-blue-500`).

## Security & Validation

- Inputs are sanitized to prevent malformed or whitespace-padded asset codes.
- The component purely runs client-side validations, ensuring data is clean before integrating with backend state managers.

## Test Coverage

- Tested via the Node native test runner (`node --test`), verifying rendering of default state, input validations, duplicate catching, and state mutations (adding, removing, toggling).