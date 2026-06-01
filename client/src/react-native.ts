/**
 * Fluid SDK — React Native entry point
 *
 * Use this import path in React Native projects:
 *
 *   import { FluidClient } from '@fluid-dev/sdk/react-native';
 *
 * Make sure to install and import the polyfill FIRST in your index.js:
 *
 *   import 'react-native-get-random-values';
 */

export { FluidClient } from "./FluidClient";
export type {
  FluidClientConfig,
  FeeBumpResponse,
  FeeBumpRequestInput,
  WaitForConfirmationOptions,
  WaitForConfirmationProgress,
} from "./FluidClient";
export { safeStorage, safeSend, getSafeDomain, isReactNative } from "./utils/rnPolyfills";