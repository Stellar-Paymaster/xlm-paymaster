import { NextResponse } from "next/server";

function getServerConfig() {
  const serverUrl = process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.FLUID_ADMIN_TOKEN?.trim();
  return { serverUrl, adminToken };
}

export async function PATCH(request: Request) {
  try {
    const { serverUrl, adminToken } = getServerConfig();
    const body = await request.json();

    const response = await fetch(`${serverUrl}/admin/configs`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken || "",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error("Backend update failed");

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Connection failed" }, { status: 500 });
  }
}