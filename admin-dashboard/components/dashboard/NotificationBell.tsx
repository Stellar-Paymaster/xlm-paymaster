"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Bell, X, CheckCheck, AlertTriangle, Info, Zap, ShieldAlert } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: "low_balance" | "incident" | "info" | "warning" | "critical";
  title: string;
  message: string;
  read: boolean;
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotifIcon({ type }: { type: Notification["type"] }) {
  const cls = "h-4 w-4 shrink-0 mt-0.5";
  switch (type) {
    case "low_balance":
      return <AlertTriangle className={`${cls} text-amber-500`} />;
    case "critical":
      return <ShieldAlert className={`${cls} text-red-500`} />;
    case "incident":
      return <Zap className={`${cls} text-rose-500`} />;
    case "warning":
      return <AlertTriangle className={`${cls} text-orange-500`} />;
    default:
      return <Info className={`${cls} text-sky-500`} />;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Fetch initial list ─────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    } catch {
      // silently ignore — non-critical UI feature
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Server-Sent Events ─────────────────────────────────────────────────

  useEffect(() => {
    fetchNotifications();

    const es = new EventSource("/api/notifications/sse");
    eventSourceRef.current = es;

    es.addEventListener("notification", (evt) => {
      try {
        const notif: Notification = JSON.parse(evt.data);
        setNotifications((prev) => {
          // Avoid duplicates
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [notif, ...prev].slice(0, 20);
        });
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener("read-all", () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [fetchNotifications]);

  // ── Actions ────────────────────────────────────────────────────────────

  const markRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* ── Trigger: Bell + badge ── */}
      <Popover.Trigger asChild>
        <button
          id="notification-bell"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-background"
              >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>

      {/* ── Dropdown panel ── */}
      <Popover.Portal>
        <Popover.Content
          id="notification-dropdown"
          sideOffset={8}
          align="end"
          className="z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl outline-none"
          style={{
            animation: "notif-in 150ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  id="notification-mark-all-read"
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  All read
                </button>
              )}
              <Popover.Close
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </Popover.Close>
            </div>
          </div>

          {/* Body */}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: "min(70vh, 420px)" }}
          >
            {loading ? (
              <div className="flex flex-col gap-3 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="h-4 w-4 shrink-0 rounded-full bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 rounded bg-muted" />
                      <div className="h-2.5 w-full rounded bg-secondary" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm font-medium text-muted-foreground">
                  No notifications yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Alerts from your Fluid server will appear here.
                </p>
              </div>
            ) : (
              <ul role="list" className="divide-y divide-border">
                {notifications.map((notif) => (
                  <li key={notif.id}>
                    <button
                      id={`notification-item-${notif.id}`}
                      className={`group w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                        !notif.read
                          ? "bg-primary/10"
                          : ""
                      }`}
                      onClick={() => {
                        if (!notif.read) markRead(notif.id);
                      }}
                    >
                      <div className="flex gap-3">
                        <NotifIcon type={notif.type} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`truncate text-sm font-medium leading-tight ${
                                notif.read
                                  ? "text-muted-foreground"
                                  : "text-foreground"
                              }`}
                            >
                              {notif.title}
                            </p>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {relativeTime(notif.createdAt)}
                              </span>
                              {!notif.read && (
                                <span
                                  aria-label="Unread"
                                  className="h-1.5 w-1.5 rounded-full bg-sky-500"
                                />
                              )}
                            </div>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {notif.message}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2.5">
              <p className="text-center text-xs text-muted-foreground">
                Showing last {notifications.length} notification
                {notifications.length !== 1 ? "s" : ""} · Real-time via SSE
              </p>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>

      {/* Keyframe animations injected via style tag */}
      <style>{`
        @keyframes notif-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
    </Popover.Root>
  );
}
