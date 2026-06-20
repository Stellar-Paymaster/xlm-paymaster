import { useCallback, useState } from "react";
import {
  FeeBumpRequestInput,
  FeeBumpResponse,
  PaymasterClient,
} from "../PaymasterClient";

export interface UseFeeBumpResult {
  requestFeeBump: (
    transaction: FeeBumpRequestInput,
    submit?: boolean
  ) => Promise<FeeBumpResponse>;
  isLoading: boolean;
  error: Error | null;
  result: FeeBumpResponse | null;
}

export function useFeeBump(client: PaymasterClient): UseFeeBumpResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<FeeBumpResponse | null>(null);

  const requestFeeBump = useCallback(
    async (
      transaction: FeeBumpRequestInput,
      submit: boolean = false
    ): Promise<FeeBumpResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await client.requestFeeBump(transaction, submit);
        setResult(response);
        return response;
      } catch (caughtError) {
        const normalizedError =
          caughtError instanceof Error
            ? caughtError
            : new Error("Failed to request fee bump");

        setError(normalizedError);
        setResult(null);
        throw normalizedError;
      } finally {
        setIsLoading(false);
      }
    },
    [client]
  );

  return {
    requestFeeBump,
    isLoading,
    error,
    result,
  };
}
