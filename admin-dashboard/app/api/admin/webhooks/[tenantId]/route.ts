import { NextRequest, NextResponse } from "next/server";

function getServerConfig() {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN?.trim();

  if (!serverUrl || !adminToken) {
    throw new Error("PAYMASTER_SERVER_URL and PAYMASTER_ADMIN_TOKEN must be configured");
  }

  return { serverUrl, adminToken };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await context.params;
    const body = await req.json();
    const { serverUrl, adminToken } = getServerConfig();

    const response = await fetch(`${serverUrl}/admin/webhooks/${encodeURIComponent(tenantId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update webhook settings",
      },
      { status: 500 },
    );
  }
}
