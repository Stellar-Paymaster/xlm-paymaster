import { useState, useCallback } from "react";
import { useFluidClient } from "../FluidProvider";
import { FeeBumpResponse } from "../../FluidClient";

export type GaslessTransactionStatus =
  | "idle"
  | "signing"
  | "sponsoring"
  | "submitting"
  | "success"
  | "error";

export interface GaslessTransactionState {
  status: GaslessTransactionStatus;
  error: Error | null;
  response: FeeBumpResponse | null;
  hash: string | null;
}

export interface UseGaslessTransactionOptions {
  /**
   * Whether to automatically submit the transaction after fee-bumping.
   * @default true
   */
  submit?: boolean;
  /**
   * Callback fired when the transaction is successfully completed.
   */
  onSuccess?: (response: FeeBumpResponse) => void;
  /**
   * Callback fired when an error occurs.
   */
  onError?: (error: Error) => void;
}

/**
 * A professional-grade hook for React Native developers to handle gasless transactions.
 * Manages the entire lifecycle from signing to submission.
 */
export function useGaslessTransaction(options: UseGaslessTransactionOptions = {}) {
  const { submit = true, onSuccess, onError } = options;
  const client = useFluidClient();

  const [state, setState] = useState<GaslessTransactionState>({
    status: "idle",
    error: null,
    response: null,
    hash: null,
  });

  const execute = useCallback(
    async (
      transaction: string | { toXDR: () => string },
      signCallback: (xdr: string) => Promise<string>
    ) => {
      setState((s) => ({ ...s, status: "signing", error: null }));

      try {
        // 1. Prepare XDR
        const xdr = typeof transaction === "string" ? transaction : transaction.toXDR();

        // 2. Sign Transaction (using the provided callback, e.g., using SecureStore or a Wallet)
        let signedXdr: string;
        try {
          signedXdr = await signCallback(xdr);
        } catch (err) {
          throw new Error(`Signing failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        // 3. Request Fee Bump (Sponsorship)
        setState((s) => ({ ...s, status: "sponsoring" }));
        const response = await client.requestFeeBump(signedXdr, submit);

        // 4. Update state
        const status = submit ? "success" : "success"; // If submitted, it's successful once we get response
        
        setState({
          status,
          error: null,
          response,
          hash: response.hash || null,
        });

        if (onSuccess) onSuccess(response);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((s) => ({ ...s, status: "error", error }));
        if (onError) onError(error);
        throw error;
      }
    },
    [client, submit, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setState({
      status: "idle",
      error: null,
      response: null,
      hash: null,
    });
  }, []);

  return {
    ...state,
    execute,
    reset,
    isLoading: state.status !== "idle" && state.status !== "success" && state.status !== "error",
  };
}
