# In-App Live Chat for Support

Provides a dedicated support-chat channel for enterprise tenants. Chat sessions can be opened, messages sent by users/agents/system, agents assigned, and sessions resolved or closed.

## API & Service Methods

### `openSession(options)`
Opens a new support session.
- `tenantId`: String (required)
- `initialMessage`: String (optional)
- `metadata`: Record (optional)

### `sendMessage(options)`
Sends a message to an active session.
- `sessionId`: String
- `role`: `"user" | "agent" | "system"`
- `content`: String

### `assignAgent(options)`
Assigns a support agent to the session.
- `sessionId`: String
- `agentId`: String

### `resolveSession(options)`
Marks a session as resolved.
- `sessionId`: String
- `reason`: String (optional)

### `closeSession(options)`
Permanently closes a session.
- `sessionId`: String
- `reason`: String (optional)

### `getSession(sessionId)`
Retrieves a session details and message history.

### `listSessionsByTenant(tenantId, statusFilter?)`
Lists all sessions for a specific tenant, optionally filtered by status.
