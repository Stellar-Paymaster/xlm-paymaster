import { NextRequest, NextResponse } from "next/server";

function getServerConfig() {
  const serverUrl = process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.FLUID_ADMIN_TOKEN?.trim();
  if (!serverUrl || !adminToken) {
    throw new Error("FLUID_SERVER_URL and FLUID_ADMIN_TOKEN must be configured");
  }
  return { serverUrl, adminToken };
}

export async function GET(req: NextRequest) {
  try {
    const { serverUrl, adminToken } = getServerConfig();
    const { searchParams } = new URL(req.url);
    const upstream = new URL(`${serverUrl}/admin/sar`);
    for (const [key, val] of searchParams.entries()) {
      upstream.searchParams.set(key, val);
    }
    const response = await fetch(upstream.toString(), {
      cache: "no-store",
      headers: { "x-admin-token": adminToken }
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch SAR reports" },
      { status: 500 }
    );
  }
}
