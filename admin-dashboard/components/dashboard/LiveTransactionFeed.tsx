"use client";

import { useEffect, useState } from "react";

interface LiveNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
}

export function LiveTransactionFeed() {
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const evtSource = new EventSource("/api/notifications/sse");

    evtSource.addEventListener("connected", () => setIsLive(true));

    evtSource.addEventListener("notification", (e) => {
      try {
        const data = JSON.parse(e.data);
        setNotifications((prev) => [data, ...prev].slice(0, 20));
      } catch {}
    });

    evtSource.onerror = () => setIsLive(false);

    return () => evtSource.close();
  }, []);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Live Notifications</h2>
          <p className="mt-1 text-sm text-slate-500">Real-time alerts appear instantly without refreshing.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-red-400"}`} />
          <span className="text-sm font-semibold text-slate-600">
            {isLive ? "Live" : "Connecting..."}
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {notifications.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            Waiting for live events...
          </div>
        ) : (
          notifications.map((n, i) => (
            <div key={n.id ?? i} className="flex items-start justify-between px-5 py-3 text-sm">
              <div>
                <div className="font-semibold text-slate-900">{n.title}</div>
                <div className="text-slate-500">{n.message}</div>
              </div>
              <div className="ml-4 shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-600">
                {n.type}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}