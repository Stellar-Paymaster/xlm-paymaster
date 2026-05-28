/**
 * liveChatService.test.ts
 * Tests for in-app live chat support service (#516)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  openSession,
  sendMessage,
  assignAgent,
  resolveSession,
  closeSession,
  getSession,
  listSessionsByTenant,
  _clearAllSessions,
} from "./liveChatService";

beforeEach(() => {
  _clearAllSessions();
});

// ─── openSession ──────────────────────────────────────────────────────────────

describe("openSession", () => {
  it("creates a session with status=open", () => {
    const session = openSession({ tenantId: "tenant-1" });
    expect(session.id).toMatch(/^session_/);
    expect(session.tenantId).toBe("tenant-1");
    expect(session.status).toBe("open");
    expect(session.messages).toHaveLength(0);
  });

  it("includes an initial user message when provided", () => {
    const session = openSession({ tenantId: "tenant-1", initialMessage: "Hello!" });
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("user");
    expect(session.messages[0].content).toBe("Hello!");
  });

  it("throws when tenantId is empty", () => {
    expect(() => openSession({ tenantId: "" })).toThrow("tenantId is required");
  });

  it("stores metadata on the session", () => {
    const session = openSession({ tenantId: "t1", metadata: { plan: "enterprise" } });
    expect(session.metadata?.plan).toBe("enterprise");
  });
});

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe("sendMessage", () => {
  it("appends a message to the session", () => {
    const session = openSession({ tenantId: "t1" });
    const msg = sendMessage({ sessionId: session.id, role: "user", content: "Help me!" });
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Help me!");

    const updated = getSession(session.id)!;
    expect(updated.messages).toHaveLength(1);
  });

  it("throws for empty content", () => {
    const session = openSession({ tenantId: "t1" });
    expect(() =>
      sendMessage({ sessionId: session.id, role: "user", content: "" })
    ).toThrow("must not be empty");
  });

  it("throws on closed session", () => {
    const session = openSession({ tenantId: "t1" });
    closeSession({ sessionId: session.id });
    expect(() =>
      sendMessage({ sessionId: session.id, role: "agent", content: "Hi" })
    ).toThrow("already closed");
  });

  it("throws for non-existent session", () => {
    expect(() =>
      sendMessage({ sessionId: "bad-id", role: "user", content: "Hi" })
    ).toThrow("Session not found");
  });
});

// ─── assignAgent ──────────────────────────────────────────────────────────────

describe("assignAgent", () => {
  it("assigns an agent and changes status to assigned", () => {
    const session = openSession({ tenantId: "t1" });
    const updated = assignAgent({ sessionId: session.id, agentId: "agent-007" });
    expect(updated.agentId).toBe("agent-007");
    expect(updated.status).toBe("assigned");
    const systemMsg = updated.messages.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("agent-007");
  });

  it("throws when agentId is empty", () => {
    const session = openSession({ tenantId: "t1" });
    expect(() => assignAgent({ sessionId: session.id, agentId: "" })).toThrow("agentId is required");
  });

  it("throws when assigning agent to a resolved session", () => {
    const session = openSession({ tenantId: "t1" });
    resolveSession({ sessionId: session.id });
    expect(() => assignAgent({ sessionId: session.id, agentId: "a1" })).toThrow("resolved");
  });
});

// ─── resolveSession ───────────────────────────────────────────────────────────

describe("resolveSession", () => {
  it("changes status to resolved", () => {
    const session = openSession({ tenantId: "t1" });
    const updated = resolveSession({ sessionId: session.id, reason: "Issue fixed" });
    expect(updated.status).toBe("resolved");
    expect(updated.messages.at(-1)?.content).toContain("Issue fixed");
  });

  it("throws on already closed session", () => {
    const session = openSession({ tenantId: "t1" });
    closeSession({ sessionId: session.id });
    expect(() => resolveSession({ sessionId: session.id })).toThrow("already closed");
  });
});

// ─── closeSession ─────────────────────────────────────────────────────────────

describe("closeSession", () => {
  it("changes status to closed", () => {
    const session = openSession({ tenantId: "t1" });
    const updated = closeSession({ sessionId: session.id });
    expect(updated.status).toBe("closed");
  });
});

// ─── listSessionsByTenant ─────────────────────────────────────────────────────

describe("listSessionsByTenant", () => {
  it("returns all sessions for a tenant", () => {
    openSession({ tenantId: "t1" });
    openSession({ tenantId: "t1" });
    openSession({ tenantId: "t2" });
    const list = listSessionsByTenant("t1");
    expect(list).toHaveLength(2);
  });

  it("filters by status", () => {
    const s1 = openSession({ tenantId: "t1" });
    openSession({ tenantId: "t1" });
    closeSession({ sessionId: s1.id });

    const open = listSessionsByTenant("t1", "open");
    expect(open).toHaveLength(1);

    const closed = listSessionsByTenant("t1", "closed");
    expect(closed).toHaveLength(1);
  });

  it("returns empty array when tenant has no sessions", () => {
    expect(listSessionsByTenant("unknown-tenant")).toHaveLength(0);
  });
});

// ─── Integration: full chat flow ──────────────────────────────────────────────

describe("Integration: full chat flow", () => {
  it("completes a full support interaction", () => {
    // 1. Tenant opens session
    const session = openSession({ tenantId: "enterprise-co", initialMessage: "My fee-bump is failing" });
    expect(session.status).toBe("open");

    // 2. Agent is assigned
    const assigned = assignAgent({ sessionId: session.id, agentId: "support-agent-1" });
    expect(assigned.status).toBe("assigned");

    // 3. Messages exchanged
    sendMessage({ sessionId: session.id, role: "agent", content: "I can help! What error are you seeing?" });
    sendMessage({ sessionId: session.id, role: "user", content: "Error 400 – bad XDR" });
    sendMessage({ sessionId: session.id, role: "agent", content: "Let me check…" });

    // 4. Resolve
    const resolved = resolveSession({ sessionId: session.id, reason: "XDR encoding issue explained" });
    expect(resolved.status).toBe("resolved");
    expect(resolved.messages.length).toBeGreaterThan(4);

    // 5. Verify via getSession
    const final = getSession(session.id)!;
    expect(final.status).toBe("resolved");
    expect(final.agentId).toBe("support-agent-1");
  });
});
