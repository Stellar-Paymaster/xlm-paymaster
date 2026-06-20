/**
 * Paymaster SDK — React Native entry point
 *
 * Use this import path in React Native projects:
 *
 *   import { PaymasterClient } from '@paymaster-dev/sdk/react-native';
 *
 * Make sure to install and import the polyfill FIRST in your index.js:
 *
 *   import 'react-native-get-random-values';
 */

export { PaymasterClient } from "./PaymasterClient";
export type {
  PaymasterClientConfig,
  FeeBumpResponse,
  FeeBumpRequestInput,
  WaitForConfirmationOptions,
  WaitForConfirmationProgress,
} from "./PaymasterClient";
export { safeStorage, safeSend, getSafeDomain, isReactNative } from "./utils/rnPolyfills";