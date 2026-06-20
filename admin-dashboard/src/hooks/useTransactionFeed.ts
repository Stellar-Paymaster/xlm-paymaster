import { useState, useEffect } from "react";

export interface TransactionEvent {
  id: string;
  hash: string;
  status: "ready" | "pending" | "success" | "failed";
  timestamp: string;
  feeBumpAmount?: string;
}

export function useTransactionFeed(url: string, maxItems: number = 100) {
  const [transactions, setTransactions] = useState<TransactionEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const newTx: TransactionEvent = JSON.parse(event.data);
        setTransactions((prev) => [newTx, ...prev].slice(0, maxItems));
      } catch (err) {
        console.error("Failed to parse transaction event", err);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError(new Error("SSE connection error. Attempting to reconnect..."));
    };

    return () => eventSource.close();
  }, [url, maxItems]);

  return { transactions, isConnected, error };
}