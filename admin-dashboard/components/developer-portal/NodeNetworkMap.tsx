"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { FluidNode } from "@/lib/node-registry";

// Leaflet is loaded dynamically so this file is always safe to import server-side.
// The actual map is mounted only on the client via useEffect.

interface NodeDetails extends FluidNode {
  pinging?: boolean;
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      aria-label={online ? "online" : "offline"}
      className={`inline-block h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`}
    />
  );
}

function NodeCard({
  node,
  onPing,
}: {
  node: NodeDetails;
  onPing: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground truncate">{node.operatorName}</span>
        <StatusDot online={node.online} />
      </div>
      <div className="text-muted-foreground text-xs">
        {node.location.city}, {node.location.country}
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {node.supportedChains.map((chain) => (
          <span
            key={chain}
            className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
          >
            {chain}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
        <span>Latency</span>
        <span className="text-right font-mono">
          {node.latencyMs != null ? `${node.latencyMs} ms` : "—"}
        </span>
        <span>Uptime</span>
        <span className="text-right font-mono">
          {node.uptimePercent != null ? `${node.uptimePercent}%` : "—"}
        </span>
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground font-mono">
        {node.apiEndpoint}
      </div>
      <button
        type="button"
        disabled={node.pinging}
        onClick={() => onPing(node.id)}
        className="mt-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition hover:bg-muted disabled:opacity-50"
      >
        {node.pinging ? "Pinging…" : "Test endpoint"}
      </button>
    </div>
  );
}

export function NodeNetworkMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<unknown>(null);
  const [nodes, setNodes] = useState<NodeDetails[]>([]);
  const [selected, setSelected] = useState<NodeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch("/api/nodes", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch nodes");
      const data = await res.json();
      setNodes(data.nodes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load nodes");
    } finally {
      setLoading(false);
    }
  }, []);

  // Mount Leaflet map after component hydrates
  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  useEffect(() => {
    if (loading || !mapRef.current || leafletMapRef.current) return;

    let map: { remove(): void; [key: string]: unknown } | null = null;

    async function initMap() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      // Fix Leaflet's default icon paths in webpack/Next.js builds
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!mapRef.current) return;

      map = L.map(mapRef.current, {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        attributionControl: true,
      }) as typeof map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map as Parameters<typeof L.tileLayer>[1] extends never ? never : object);

      leafletMapRef.current = map;
    }

    initMap().catch(() => {});

    return () => {
      if (map) {
        map.remove();
        leafletMapRef.current = null;
      }
    };
  }, [loading]);

  // Add/update markers whenever nodes change
  useEffect(() => {
    if (!leafletMapRef.current || nodes.length === 0) return;

    async function addMarkers() {
      const L = (await import("leaflet")).default;
      const map = leafletMapRef.current as { addLayer(l: unknown): void; [k: string]: unknown };

      for (const node of nodes) {
        const color = node.online ? "#10b981" : "#f43f5e";
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:${color};border:2px solid #fff;
            box-shadow:0 0 0 2px ${color}44;
          "></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const marker = L.marker([node.location.lat, node.location.lng], { icon });
        marker.bindPopup(
          `<div style="min-width:160px;font-size:13px;">
            <strong>${node.operatorName}</strong><br/>
            ${node.location.city}, ${node.location.country}<br/>
            <span style="color:${color};font-weight:600;">${node.online ? "● Online" : "● Offline"}</span>
            ${node.latencyMs != null ? `&nbsp;· ${node.latencyMs} ms` : ""}
            <br/><small style="color:#6b7280;">${node.supportedChains.join(", ")}</small>
          </div>`,
          { maxWidth: 220 },
        );
        marker.on("click", () => setSelected(node));
        marker.addTo(map as Parameters<typeof L.marker>[1] extends never ? never : object);
      }
    }

    addMarkers().catch(() => {});
  }, [nodes]);

  const handlePing = useCallback(async (id: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinging: true } : n)),
    );
    try {
      const res = await fetch(`/api/nodes/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Ping failed");
      const data = await res.json();
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, ...data.node, pinging: false }
            : n,
        ),
      );
      if (selected?.id === id) {
        setSelected((prev) => (prev ? { ...prev, ...data.node, pinging: false } : prev));
      }
    } catch {
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, pinging: false } : n)),
      );
    }
  }, [selected]);

  return (
    <section
      id="node-network"
      aria-labelledby="node-network-heading"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
    >
      <div className="mb-8 text-center">
        <h2
          id="node-network-heading"
          className="text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Public Node Network
        </h2>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          Fluid nodes registered by operators worldwide. Click a marker to inspect
          an endpoint or test it live.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div
          data-testid="node-map-container"
          className="relative overflow-hidden rounded-2xl border border-border shadow-sm"
          style={{ height: 480 }}
        >
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/60">
              <span className="text-sm text-muted-foreground animate-pulse">Loading map…</span>
            </div>
          )}
          <div ref={mapRef} className="h-full w-full" />
        </div>

        <aside className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              {nodes.length} registered node{nodes.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={fetchNodes}
              className="text-xs text-primary hover:underline"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-xl bg-muted"
                aria-hidden
              />
            ))
          ) : nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No nodes registered yet.</p>
          ) : (
            <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 440 }}>
              {nodes.map((node) => (
                <NodeCard key={node.id} node={node} onPing={handlePing} />
              ))}
            </div>
          )}
        </aside>
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Node details: ${selected.operatorName}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-4">
              <h3 className="font-bold text-foreground">{selected.operatorName}</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <NodeCard node={selected} onPing={handlePing} />
          </div>
        </div>
      )}
    </section>
  );
}
