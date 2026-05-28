/**
 * liveChatService.ts
 * In-app Live Chat for Support (#516)
 *
 * Provides a dedicated support-chat channel for enterprise tenants.
 * Persists chat sessions and messages in memory (swap for DB in production).
 */

export type MessageRole = "user" | "agent" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  tenantId: string;
  agentId?: string;
  status: "open" | "assigned" | "resolved" | "closed";
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface OpenSessionOptions {
  tenantId: string;
  initialMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageOptions {
  sessionId: string;
  role: MessageRole;
  content: string;
}

export interface AssignAgentOptions {
  sessionId: string;
  agentId: string;
}

export interface CloseSessionOptions {
  sessionId: string;
  reason?: string;
}

let _idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_idCounter}`;
}

// In-memory store – replace with a DB-backed store for production
const sessions = new Map<string, ChatSession>();

/**
 * Open a new support chat session for a tenant.
 */
export function openSession(options: OpenSessionOptions): ChatSession {
  const { tenantId, initialMessage, metadata } = options;

  if (!tenantId || tenantId.trim() === "") {
    throw new Error("tenantId is required to open a chat session");
  }

  const sessionId = generateId("session");
  const now = new Date();

  const session: ChatSession = {
    id: sessionId,
    tenantId,
    status: "open",
    messages: [],
    createdAt: now,
    updatedAt: now,
    metadata,
  };

  if (initialMessage) {
    const msg = buildMessage("user", initialMessage);
    session.messages.push(msg);
  }

  sessions.set(sessionId, session);
  return { ...session, messages: [...session.messages] };
}

/**
 * Send a message in an existing session.
 */
export function sendMessage(options: SendMessageOptions): ChatMessage {
  const { sessionId, role, content } = options;

  if (!content || content.trim() === "") {
    throw new Error("Message content must not be empty");
  }

  const session = getSessionOrThrow(sessionId);

  if (session.status === "closed") {
    throw new Error(`Session ${sessionId} is already closed`);
  }

  const msg = buildMessage(role, content);
  session.messages.push(msg);
  session.updatedAt = new Date();

  return { ...msg };
}

/**
 * Assign a support agent to a session.
 */
export function assignAgent(options: AssignAgentOptions): ChatSession {
  const { sessionId, agentId } = options;

  if (!agentId || agentId.trim() === "") {
    throw new Error("agentId is required");
  }

  const session = getSessionOrThrow(sessionId);

  if (session.status === "closed" || session.status === "resolved") {
    throw new Error(`Cannot assign agent to a ${session.status} session`);
  }

  session.agentId = agentId;
  session.status = "assigned";
  session.updatedAt = new Date();

  // Send a system message announcing the assignment
  const systemMsg = buildMessage("system", `Agent ${agentId} has joined the session.`);
  session.messages.push(systemMsg);

  return { ...session, messages: [...session.messages] };
}

/**
 * Resolve (soft-close) a session.
 */
export function resolveSession(options: CloseSessionOptions): ChatSession {
  const { sessionId, reason } = options;
  const session = getSessionOrThrow(sessionId);

  if (session.status === "closed") {
    throw new Error(`Session ${sessionId} is already closed`);
  }

  session.status = "resolved";
  session.updatedAt = new Date();

  const note = reason ? ` Reason: ${reason}` : "";
  session.messages.push(buildMessage("system", `Session resolved.${note}`));

  return { ...session, messages: [...session.messages] };
}

/**
 * Permanently close a session.
 */
export function closeSession(options: CloseSessionOptions): ChatSession {
  const { sessionId, reason } = options;
  const session = getSessionOrThrow(sessionId);

  session.status = "closed";
  session.updatedAt = new Date();

  const note = reason ? ` Reason: ${reason}` : "";
  session.messages.push(buildMessage("system", `Session closed.${note}`));

  return { ...session, messages: [...session.messages] };
}

/**
 * Retrieve a session by ID.
 */
export function getSession(sessionId: string): ChatSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  return { ...session, messages: [...session.messages] };
}

/**
 * List all sessions for a given tenant.
 */
export function listSessionsByTenant(
  tenantId: string,
  statusFilter?: ChatSession["status"]
): ChatSession[] {
  const result: ChatSession[] = [];
  for (const session of sessions.values()) {
    if (session.tenantId !== tenantId) continue;
    if (statusFilter && session.status !== statusFilter) continue;
    result.push({ ...session, messages: [...session.messages] });
  }
  // Newest first
  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Wipe all sessions (useful for tests).
 */
export function _clearAllSessions(): void {
  sessions.clear();
  _idCounter = 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMessage(role: MessageRole, content: string): ChatMessage {
  return {
    id: generateId("msg"),
    role,
    content,
    timestamp: new Date(),
  };
}

function getSessionOrThrow(sessionId: string): ChatSession {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return session;
}
