import { NextRequest, NextResponse } from "next/server";

function getServerConfig() {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN?.trim();

  if (!serverUrl || !adminToken) {
    throw new Error("PAYMASTER_SERVER_URL and PAYMASTER_ADMIN_TOKEN must be configured");
  }

  return { serverUrl, adminToken };
}

export async function GET() {
  try {
    const { serverUrl, adminToken } = getServerConfig();
    const response = await fetch(`${serverUrl}/admin/webhooks/dlq`, {
      cache: "no-store",
      headers: {
        "x-admin-token": adminToken,
      },
    });

    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch DLQ items",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, ids } = await req.json();
    const { serverUrl, adminToken } = getServerConfig();

    const endpoint = action === "replay"
      ? `${serverUrl}/admin/webhooks/dlq/replay`
      : `${serverUrl}/admin/webhooks/dlq/delete`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({ ids }),
    });

    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process DLQ action",
      },
      { status: 500 },
    );
  }
}
