import "server-only";

export interface FluidNode {
  id: string;
  operatorName: string;
  apiEndpoint: string;
  location: {
    city: string;
    country: string;
    lat: number;
    lng: number;
  };
  supportedChains: string[];
  registeredAt: string;
  lastPingedAt: string | null;
  latencyMs: number | null;
  uptimePercent: number | null;
  online: boolean;
}

export interface NodeRegistrationInput {
  operatorName: string;
  apiEndpoint: string;
  location: {
    city: string;
    country: string;
    lat: number;
    lng: number;
  };
  supportedChains: string[];
}

export interface NodePingResult {
  online: boolean;
  latencyMs: number | null;
}

// In-process singleton store (reset on server restart — suitable for stateless deployments
// where a real DB migration is pending; replace with Prisma/DB calls once schema is in place).
const registry = new Map<string, FluidNode>();

function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function validateNodeInput(input: unknown): NodeRegistrationInput {
  if (!input || typeof input !== "object") {
    throw new Error("Request body must be a JSON object");
  }
  const body = input as Record<string, unknown>;

  if (typeof body.operatorName !== "string" || !body.operatorName.trim()) {
    throw new Error("operatorName is required");
  }
  if (typeof body.apiEndpoint !== "string" || !body.apiEndpoint.trim()) {
    throw new Error("apiEndpoint is required");
  }
  try {
    new URL(body.apiEndpoint as string);
  } catch {
    throw new Error("apiEndpoint must be a valid URL");
  }

  const loc = body.location as Record<string, unknown> | undefined;
  if (!loc || typeof loc !== "object") {
    throw new Error("location object is required");
  }
  if (typeof loc.city !== "string" || !loc.city.trim()) {
    throw new Error("location.city is required");
  }
  if (typeof loc.country !== "string" || !loc.country.trim()) {
    throw new Error("location.country is required");
  }
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("location.lat must be a number between -90 and 90");
  }
  if (!isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("location.lng must be a number between -180 and 180");
  }

  const chains = body.supportedChains;
  if (!Array.isArray(chains) || chains.length === 0) {
    throw new Error("supportedChains must be a non-empty array");
  }
  if (!chains.every((c) => typeof c === "string")) {
    throw new Error("supportedChains entries must be strings");
  }

  return {
    operatorName: (body.operatorName as string).trim(),
    apiEndpoint: (body.apiEndpoint as string).trim().replace(/\/$/, ""),
    location: {
      city: (loc.city as string).trim(),
      country: (loc.country as string).trim(),
      lat,
      lng,
    },
    supportedChains: (chains as string[]).map((c) => c.trim()).filter(Boolean),
  };
}

export function registerNode(input: NodeRegistrationInput): FluidNode {
  // Prevent duplicate endpoints
  for (const existing of registry.values()) {
    if (existing.apiEndpoint === input.apiEndpoint) {
      throw new Error(`A node with endpoint ${input.apiEndpoint} is already registered`);
    }
  }

  const node: FluidNode = {
    id: generateId(),
    ...input,
    registeredAt: new Date().toISOString(),
    lastPingedAt: null,
    latencyMs: null,
    uptimePercent: null,
    online: false,
  };
  registry.set(node.id, node);
  return node;
}

export function listNodes(): FluidNode[] {
  return Array.from(registry.values()).sort(
    (a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime(),
  );
}

export function getNode(id: string): FluidNode | undefined {
  return registry.get(id);
}

export async function pingNode(id: string): Promise<NodePingResult> {
  const node = registry.get(id);
  if (!node) throw new Error(`Node ${id} not found`);

  const start = Date.now();
  let online = false;
  let latencyMs: number | null = null;

  const pingIntervalMs = Number(process.env.NODE_PING_TIMEOUT_MS ?? 5000);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), pingIntervalMs);
    const res = await fetch(`${node.apiEndpoint}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    latencyMs = Date.now() - start;
    online = res.ok;
  } catch {
    latencyMs = null;
    online = false;
  }

  // Track rolling uptime: simple EWMA (alpha=0.2) capped to [0,100]
  const prevUptime = node.uptimePercent ?? 100;
  const sample = online ? 100 : 0;
  const newUptime = Math.round(prevUptime * 0.8 + sample * 0.2);

  const updated: FluidNode = {
    ...node,
    lastPingedAt: new Date().toISOString(),
    latencyMs,
    online,
    uptimePercent: newUptime,
  };
  registry.set(id, updated);

  return { online, latencyMs };
}

export function seedDemoNodes(): void {
  if (registry.size > 0) return;

  const demos: NodeRegistrationInput[] = [
    {
      operatorName: "Fluid Foundation (US-East)",
      apiEndpoint: "https://node-us-east.fluid.dev",
      location: { city: "Ashburn", country: "US", lat: 39.0438, lng: -77.4874 },
      supportedChains: ["stellar", "soroban"],
    },
    {
      operatorName: "Fluid Foundation (EU-West)",
      apiEndpoint: "https://node-eu-west.fluid.dev",
      location: { city: "Frankfurt", country: "DE", lat: 50.1109, lng: 8.6821 },
      supportedChains: ["stellar", "soroban"],
    },
    {
      operatorName: "Community Node (AP-South)",
      apiEndpoint: "https://fluid-ap.example.com",
      location: { city: "Singapore", country: "SG", lat: 1.3521, lng: 103.8198 },
      supportedChains: ["stellar"],
    },
  ];

  for (const demo of demos) {
    const node = registerNode(demo);
    // Seed with plausible status for demo display
    registry.set(node.id, {
      ...node,
      online: true,
      latencyMs: Math.floor(Math.random() * 80) + 20,
      uptimePercent: 99,
      lastPingedAt: new Date().toISOString(),
    });
  }
}
