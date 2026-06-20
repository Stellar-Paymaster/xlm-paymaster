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
    const response = await fetch(`${serverUrl}/admin/signers`, {
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
        error: error instanceof Error ? error.message : "Failed to fetch signers",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { serverUrl, adminToken } = getServerConfig();
    const body = await req.json();
    const response = await fetch(`${serverUrl}/admin/signers`, {
      method: "POST",
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
        error: error instanceof Error ? error.message : "Failed to add signer",
      },
      { status: 500 },
    );
  }
}
