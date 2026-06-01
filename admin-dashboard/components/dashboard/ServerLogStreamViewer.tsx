"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Radio, Trash2 } from "lucide-react";
import { parseServerLogEvent, type ServerLogEvent, type ServerLogLevel } from "@/lib/server-log-stream";

const MAX_LOG_ROWS = 200;

const levelClassName: Record<ServerLogLevel, string> = {
  debug: "bg-slate-100 text-slate-700 ring-slate-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
};

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ServerLogStreamViewer() {
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [logs, setLogs] = useState<ServerLogEvent[]>([]);

  useEffect(() => {
    if (paused) {
      setConnected(false);
      return;
    }

    const eventSource = new EventSource("/api/admin/logs/sse");

    eventSource.addEventListener("connected", () => setConnected(true));
    eventSource.addEventListener("heartbeat", () => setConnected(true));
    eventSource.addEventListener("log", (event) => {
      const parsed = parseServerLogEvent(event.data);
      if (!parsed) {
        return;
      }

      setLogs((current) => {
        if (current.some((entry) => entry.id === parsed.id)) {
          return current;
        }

        return [parsed, ...current].slice(0, MAX_LOG_ROWS);
      });
    });

    eventSource.onerror = () => setConnected(false);

    return () => eventSource.close();
  }, [paused]);

  const errorCount = useMemo(
    () => logs.filter((entry) => entry.level === "error").length,
    [logs],
  );

  return (
    <section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Server Logs</h2>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-400"}`} />
              {connected ? "Live" : "Disconnected"}
            </span>
            <span>{logs.length} buffered</span>
            <span>{errorCount} errors</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={paused ? "Resume server log stream" : "Pause server log stream"}
            onClick={() => setPaused((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Clear server logs"
            onClick={() => setLogs([])}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-auto bg-slate-950">
        {logs.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center gap-2 px-5 py-8 text-sm text-slate-400">
            <Radio className="h-4 w-4" />
            Waiting for server log events
          </div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {logs.map((entry) => (
              <li key={entry.id} className="grid gap-3 px-5 py-3 text-sm md:grid-cols-[5.5rem_5rem_8rem_1fr]">
                <span className="font-mono text-slate-400">{formatTimestamp(entry.timestamp)}</span>
                <span>
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase ring-1 ${levelClassName[entry.level]}`}>
                    {entry.level}
                  </span>
                </span>
                <span className="truncate font-mono text-slate-400">{entry.service}</span>
                <span className="min-w-0 break-words text-slate-100">{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
