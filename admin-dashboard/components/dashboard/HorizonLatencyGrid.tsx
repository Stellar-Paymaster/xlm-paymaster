import type { HorizonEndpointHealth } from "@/lib/horizon-monitor";

function statusTone(status: HorizonEndpointHealth["syncStatus"]) {
  switch (status) {
    case "synced":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function statusLabel(status: HorizonEndpointHealth["syncStatus"]) {
  switch (status) {
    case "synced":
      return "Synced";
    case "degraded":
      return "Lagging";
    default:
      return "Offline";
  }
}

function formatLatency(latencyMs: number | null) {
  return latencyMs === null ? "—" : `${latencyMs} ms`;
}

export function HorizonLatencyGrid({ endpoints }: { endpoints: HorizonEndpointHealth[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
          Horizon Health
        </p>
        <h2 className="text-xl font-semibold text-slate-950">Horizon Node Live Latency Grid</h2>
        <p className="text-sm text-slate-600">
          Active Horizon URLs with ping latency and current synchronization status.
        </p>
      </div>

      {endpoints.length > 0 ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {endpoints.map((endpoint) => (
            <article key={endpoint.url} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{endpoint.label}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{endpoint.url}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusTone(endpoint.syncStatus)}`}>
                  {statusLabel(endpoint.syncStatus)}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Latency</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{formatLatency(endpoint.latencyMs)}</dd>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Ping</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{endpoint.online ? "Reachable" : "Unreachable"}</dd>
                </div>
              </dl>

              <p className="mt-3 text-xs text-slate-500">
                Last checked {new Date(endpoint.lastCheckedAt).toLocaleTimeString()}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">
          No Horizon endpoints are available.
        </div>
      )}
    </section>
  );
}