import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

function getServerConfig() {
  const serverUrl = process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.FLUID_ADMIN_TOKEN?.trim();
  if (!serverUrl || !adminToken) {
    throw new Error("FLUID_SERVER_URL and FLUID_ADMIN_TOKEN must be configured");
  }
  return { serverUrl, adminToken };
}

async function adminHeaders(): Promise<Record<string, string>> {
  const session = await auth();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-admin-token": process.env.FLUID_ADMIN_TOKEN?.trim() ?? "",
  };
  if (session?.user?.adminJwt) headers["x-admin-jwt"] = session.user.adminJwt;
  return headers;
}

export async function GET() {
  try {
    const { serverUrl } = getServerConfig();
    const response = await fetch(`${serverUrl}/admin/users`, {
      cache: "no-store",
      headers: await adminHeaders(),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { serverUrl } = getServerConfig();
    const body = await req.json();
    const response = await fetch(`${serverUrl}/admin/users`, {
      method: "POST",
      headers: await adminHeaders(),
      body: JSON.stringify(body),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create user" },
      { status: 500 }
    );
  }
}
