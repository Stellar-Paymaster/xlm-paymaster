# Real-time Transaction Feed

The Fluid admin dashboard implements a live, real-time transaction feed allowing administrators to monitor fee-bumps as they occur across the platform using **Server-Sent Events (SSE)**.

## Architecture

We use Server-Sent Events over standard WebSockets due to their unidirectional nature. The server only needs to push events down to the dashboard; the dashboard does not need to send messages back. This reduces overhead and simplifies connection recovery.

### `useTransactionFeed` Hook
Located in `admin-dashboard/src/hooks/useTransactionFeed.ts`, this hook abstracts the native browser `EventSource` API:
- Establishes a connection to the provided API feed endpoint.
- Buffers a configurable maximum number of incoming transactions (defaults to 100).
- Listens for `onmessage`, `onopen`, and `onerror` states.
- Automatically attempts to reconnect upon failure.

### Presentation Component
The `TransactionFeed` UI component (`admin-dashboard/src/components/TransactionFeed.tsx`) consumes the hook and provides a live rolling list. It formats truncated transaction hashes, displays XLM fee coverage, and visualizes the connection status (🟢 Live / 🔴 Offline).

## Usage

To mount the live feed in any dashboard view:

```tsx
import { TransactionFeed } from "@/components/TransactionFeed";

function Dashboard() {
  return <TransactionFeed feedUrl="/api/admin/transactions/live" maxItems={50} />;
}
```