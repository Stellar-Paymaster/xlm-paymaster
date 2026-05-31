export type HorizonSyncStatus = "synced" | "degraded" | "offline";

export interface HorizonEndpoint {
  label: string;
  url: string;
}

export interface HorizonEndpointHealth extends HorizonEndpoint {
  online: boolean;
  latencyMs: number | null;
  syncStatus: HorizonSyncStatus;
  lastCheckedAt: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

export const DEFAULT_HORIZON_ENDPOINTS: HorizonEndpoint[] = [
  {
    label: "Public Horizon",
    url: "https://horizon.stellar.org",
  },
  {
    label: "Testnet Horizon",
    url: "https://horizon-testnet.stellar.org",
  },
  {
    label: "Sandbox Horizon",
    url: process.env.NEXT_PUBLIC_SANDBOX_HORIZON_URL?.trim() || "http://localhost:8000",
  },
];

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function resolveSyncStatus(online: boolean, latencyMs: number | null): HorizonSyncStatus {
  if (!online) {
    return "offline";
  }

  if (latencyMs === null || latencyMs > 350) {
    return "degraded";
  }

  return "synced";
}

async function probeEndpoint(endpoint: HorizonEndpoint): Promise<HorizonEndpointHealth> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalizeUrl(endpoint.url)}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    const latencyMs = Date.now() - startedAt;
    const online = response.ok;

    return {
      ...endpoint,
      online,
      latencyMs: online ? latencyMs : null,
      syncStatus: resolveSyncStatus(online, online ? latencyMs : null),
      lastCheckedAt: new Date().toISOString(),
    };
  } catch {
    clearTimeout(timer);

    return {
      ...endpoint,
      online: false,
      latencyMs: null,
      syncStatus: "offline",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export async function getHorizonLatencyGridData(
  endpoints: HorizonEndpoint[] = DEFAULT_HORIZON_ENDPOINTS,
): Promise<HorizonEndpointHealth[]> {
  return Promise.all(endpoints.map((endpoint) => probeEndpoint(endpoint)));
}