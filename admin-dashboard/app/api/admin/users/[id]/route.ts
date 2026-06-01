import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

async function adminHeaders(): Promise<Record<string, string>> {
  const session = await auth();
  const headers: Record<string, string> = {
    "x-admin-token": process.env.FLUID_ADMIN_TOKEN?.trim() ?? "",
  };
  if (session?.user?.adminJwt) headers["x-admin-jwt"] = session.user.adminJwt;
  return headers;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serverUrl = process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "");
    if (!serverUrl) throw new Error("FLUID_SERVER_URL not configured");
    const response = await fetch(`${serverUrl}/admin/users/${params.id}`, {
      method: "DELETE",
      headers: await adminHeaders(),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to deactivate user" },
      { status: 500 }
    );
  }
}
