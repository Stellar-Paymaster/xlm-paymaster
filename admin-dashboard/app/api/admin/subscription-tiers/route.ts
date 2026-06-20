import { NextRequest, NextResponse } from "next/server";

function getServerConfig() {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN?.trim();

  if (!serverUrl || !adminToken) {
    throw new Error("PAYMASTER_SERVER_URL and PAYMASTER_ADMIN_TOKEN must be configured");
  }

  return { serverUrl, adminToken };
}

export async function GET(req: NextRequest) {
  try {
    const { serverUrl, adminToken } = getServerConfig();
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    const url = tenantId
      ? `${serverUrl}/admin/subscription-tiers?tenantId=${encodeURIComponent(tenantId)}`
      : `${serverUrl}/admin/subscription-tiers`;

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "x-admin-token": adminToken,
      },
    });

    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch subscription tiers",
      },
      { status: 500 },
    );
  }
}
