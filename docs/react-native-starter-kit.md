# React Native Gasless Starter Kit

This guide provides everything mobile developers need to implement gasless Stellar transactions using the Fluid platform in React Native.

## Features

- **FluidProvider**: Seamless client initialization for mobile.
- **useGaslessTransaction Hook**: Full transaction lifecycle management.
- **SponsorButton Component**: Premium, touch-optimized UI.
- **Secure by Design**: Encapsulates best practices for signing and state handling.

## Installation

```bash
npm install fluid-client
```

### Required Polyfills

React Native environments usually require polyfills for `Buffer` and `crypto` to work with `@stellar/stellar-sdk`.

1. Install polyfills:
```bash
npm install buffer react-native-get-random-values
```

2. Add this to the top of your `index.js` or `App.tsx`:
```javascript
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;
```

## Setup

Wrap your application with the `FluidProvider`:

```tsx
import { ReactNative } from 'fluid-client';

const fluidConfig = {
  serverUrl: "https://your-fluid-server.com",
  networkPassphrase: "Test SDF Network ; September 2015",
};

export default function App() {
  return (
    <ReactNative.FluidProvider config={fluidConfig}>
      <YourAppContent />
    </ReactNative.FluidProvider>
  );
}
```

## Basic Usage

### Using the SponsorButton

The easiest way to implement sponsorship is using the `SponsorButton` component.

```tsx
import { ReactNative } from 'fluid-client';

export const MySponsorshipScreen = () => {
  const handleSign = async (xdr: string) => {
    // Implement your signing logic here
    // Example using a local secret (ensure secure storage in production!)
    const keypair = StellarSdk.Keypair.fromSecret("SD...");
    const tx = new StellarSdk.Transaction(xdr, "Test SDF Network ; September 2015");
    tx.sign(keypair);
    return tx.toXDR();
  };

  return (
    <ReactNative.SponsorButton
      transaction={unsignedTxXdr}
      onSign={handleSign}
      onSuccess={(resp) => console.log("Success!", resp.hash)}
      onError={(err) => console.error("Error:", err.message)}
    />
  );
};
```

### Using the useGaslessTransaction Hook

For more control over your UI, use the custom hook:

```tsx
import { ReactNative } from 'fluid-client';

const { execute, status, isLoading, error, hash } = ReactNative.useGaslessTransaction({
  submit: true,
  onSuccess: (resp) => console.log("Done!", resp.hash),
});

const handlePress = async () => {
  await execute(txXdr, async (unsignedXdr) => {
    // Custom signing logic
    return signedXdr;
  });
};
```

## Best Practices

### 1. Secure Key Management
Never hardcode secret keys. Use libraries like `react-native-keychain` or `expo-secure-store` to store and retrieve keys securely.

### 2. Error Handling
Always implement the `onError` callback to handle network failures or sponsorship rejections (e.g., if the user has reached their daily limit).

### 3. Optimization
`FluidProvider` automatically disables Web Workers for React Native by default, as they are not natively supported in the same way as browsers. This ensures maximum compatibility out-of-the-box.
