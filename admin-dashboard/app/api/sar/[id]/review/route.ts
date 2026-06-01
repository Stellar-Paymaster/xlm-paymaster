import { NextRequest, NextResponse } from "next/server";

function getServerConfig() {
  const serverUrl = process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.FLUID_ADMIN_TOKEN?.trim();
  if (!serverUrl || !adminToken) {
    throw new Error("FLUID_SERVER_URL and FLUID_ADMIN_TOKEN must be configured");
  }
  return { serverUrl, adminToken };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { serverUrl, adminToken } = getServerConfig();
    const body = await req.json();

    const response = await fetch(`${serverUrl}/admin/sar/${id}/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to review SAR report" },
      { status: 500 }
    );
  }
}
