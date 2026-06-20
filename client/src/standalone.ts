/**
 * Paymaster Standalone Bundle Entry Point
 *
 * This file is the entry point for the browser IIFE/UMD bundle.
 * It exports all public API under the global `Paymaster` namespace so developers
 * can use the SDK with a plain <script> tag — no build tool required.
 *
 * Usage:
 *   <script src="https://unpkg.com/paymaster-client/dist/paymaster.min.js"></script>
 *   <script>
 *     const client = new Paymaster.PaymasterClient({ ... });
 *   </script>
 */

export { PaymasterClient } from "./PaymasterClient";
export type {
  PaymasterClientConfig,
  FeeBumpResponse,
  FeeBumpRequestInput,
  FeeBumpRequestBody,
  FeeBumpBatchRequestBody,
  XdrSerializableTransaction,
} from "./PaymasterClient";

// Universal wallet signing (WalletConnect standard bindings, SEP-43 adapters)
export * from "./wallet";

export const VERSION = "0.1.0";
