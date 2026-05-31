import { auth } from "@/auth";
import { fluidAdminToken, fluidServerUrl } from "@/lib/server-env";
import { createServerLogEvent, formatSseEvent } from "@/lib/server-log-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

async function proxyUpstreamLogStream(): Promise<Response | null> {
  const upstreamUrl =
    process.env.FLUID_SERVER_LOG_SSE_URL?.trim() || `${fluidServerUrl}/admin/logs/sse`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        ...(fluidAdminToken ? { "x-admin-token": fluidAdminToken } : {}),
      },
      // @ts-expect-error Node fetch accepts streaming request options.
      duplex: "half",
    });

    if (!upstream.ok || !upstream.body) {
      return null;
    }

    return new Response(upstream.body, { headers: sseHeaders() });
  } catch {
    return null;
  }
}

function localLogStream(): Response {
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown, id?: string) => {
        controller.enqueue(encoder.encode(formatSseEvent(event, data, id)));
      };

      const connected = createServerLogEvent({
        id: "dashboard-log-stream-connected",
        level: "info",
        message: "Dashboard log stream connected",
        service: "admin-dashboard",
      });
      const upstreamUnavailable = createServerLogEvent({
        level: "warn",
        message: "Fluid server log stream is unavailable; waiting for upstream logs",
        service: "admin-dashboard",
      });

      send("connected", { ok: true, timestamp: connected.timestamp }, connected.id);
      send("log", connected, connected.id);
      send("log", upstreamUnavailable, upstreamUnavailable.id);

      heartbeat = setInterval(() => {
        send("heartbeat", { timestamp: new Date().toISOString() });
      }, 15_000);
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  return (await proxyUpstreamLogStream()) ?? localLogStream();
}
