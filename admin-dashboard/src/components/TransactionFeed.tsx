import React from "react";
import { useTransactionFeed } from "../hooks/useTransactionFeed";

export interface TransactionFeedProps {
  feedUrl: string;
  maxItems?: number;
}

export const TransactionFeed: React.FC<TransactionFeedProps> = ({ feedUrl, maxItems = 50 }) => {
  const { transactions, isConnected, error } = useTransactionFeed(feedUrl, maxItems);

  return (
    <div className="transaction-feed-container">
      <div className="feed-header">
        <h2>Live Transactions</h2>
        <div className="connection-status">
          {isConnected ? (
            <span className="status-indicator connected" title="Connected">🟢 Live</span>
          ) : (
            <span className="status-indicator disconnected" title="Disconnected">🔴 Offline</span>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      <div className="feed-list">
        {transactions.length === 0 && isConnected && (
          <p className="empty-state">Waiting for new transactions...</p>
        )}
        <ul>
          {transactions.map((tx) => (
            <li key={tx.id} className="feed-item">
              <div className="tx-details">
                <span className="tx-hash" title={tx.hash}>
                  {tx.hash.substring(0, 8)}...{tx.hash.substring(tx.hash.length - 8)}
                </span>
                {tx.feeBumpAmount && <span className="tx-fee">Fee: {tx.feeBumpAmount} XLM</span>}
              </div>
              <div className="tx-meta">
                <span className={`tx-status status-${tx.status}`}>{tx.status}</span>
                <span className="tx-time">{new Date(tx.timestamp).toLocaleTimeString()}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};