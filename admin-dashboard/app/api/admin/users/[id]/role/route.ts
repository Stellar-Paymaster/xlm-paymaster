import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

async function adminHeaders(): Promise<Record<string, string>> {
  const session = await auth();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-admin-token": process.env.FLUID_ADMIN_TOKEN?.trim() ?? "",
  };
  if (session?.user?.adminJwt) headers["x-admin-jwt"] = session.user.adminJwt;
  return headers;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serverUrl = process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "");
    if (!serverUrl) throw new Error("FLUID_SERVER_URL not configured");
    const body = await req.json();
    const response = await fetch(`${serverUrl}/admin/users/${params.id}/role`, {
      method: "PATCH",
      headers: await adminHeaders(),
      body: JSON.stringify(body),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update role" },
      { status: 500 }
    );
  }
}
