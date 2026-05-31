# React Native Compatibility Guide

The Fluid SDK works in React Native with a few small setup steps.

## Installation

```bash
npm install @fluid-dev/sdk react-native-get-random-values
```

## Setup

In your entry file (e.g. `index.js`), add this as the **very first import**:

```js
import 'react-native-get-random-values';
```

This must come before any Fluid SDK imports.

## Usage

```js
import 'react-native-get-random-values';
import { FluidClient } from '@fluid-dev/sdk/react-native';

const client = new FluidClient({
  serverUrl: 'https://your-fluid-server.com',
  networkPassphrase: 'Test SDF Network ; September 2015',
  horizonUrl: 'https://horizon-testnet.stellar.org',
});

const response = await client.requestFeeBump(signedXdr);
console.log(response.status);
```

## What This Fixes

| Problem | Fix |
|---|---|
| `crypto.getRandomValues` not found | Install `react-native-get-random-values` |
| `localStorage` not available | SDK uses in-memory fallback automatically |
| `navigator.sendBeacon` not available | SDK falls back to `fetch` automatically |
| `Worker` not available | SDK skips Web Workers automatically |
| `window.location` not available | SDK returns `'react-native'` as domain |

## Notes

- The SDK automatically detects React Native and adjusts its behaviour
- Telemetry and diagnostics are fully safe to use in React Native
- Web Workers are not supported in React Native and are skipped automatically