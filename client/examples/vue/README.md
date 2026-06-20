# XLM Paymaster Vue Example

This is a basic Vue 3 example application demonstrating how to use the XLM Paymaster SDK with the `usePaymaster` composable.

## Features

- Vue 3 with Composition API
- TypeScript support
- Vite for fast development
- Demonstrates the `usePaymaster` composable for gasless Stellar transactions

## Prerequisites

- Node.js 18+
- A running XLM Paymaster server (default: http://localhost:3000)

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The application will be available at http://localhost:3000

## Building for Production

```bash
npm run build
```

## Usage

The example demonstrates:

1. Creating a XLM Paymaster client instance
2. Using the `usePaymaster` composable to get reactive state
3. Creating and signing a Stellar transaction
4. Requesting a fee bump from the XLM Paymaster server
5. Displaying the result with reactive updates

### Key Components

- **App.vue**: Main component demonstrating the `usePaymaster` composable
- **usePaymaster**: Vue composable that provides `requestFeeBump`, `isLoading`, `error`, and `result`

### Reactive State

The `usePaymaster` composable returns:

- `requestFeeBump(transaction, submit?)`: Function to request a fee bump
- `isLoading`: Ref<boolean> - Loading state
- `error`: Ref<Error | null> - Error state
- `result`: ShallowRef<FeeBumpResponse | null> - Result from the fee bump request

## Example Code

```vue
<script setup lang="ts">
import { PaymasterClient } from "paymaster-client";
import { usePaymaster } from "paymaster-client/vue";

const client = new PaymasterClient({
  serverUrl: "http://localhost:3000",
  networkPassphrase: StellarSdk.Networks.TESTNET,
  horizonUrl: "https://horizon-testnet.stellar.org",
});

const { requestFeeBump, isLoading, error, result } = usePaymaster(client);

async function handleRequestFeeBump() {
  await requestFeeBump(transactionXdr, false);
}
</script>
```

## License

ISC
