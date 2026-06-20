import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== "string") {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  const serverUrl = process.env.PAYMASTER_SERVER_URL ?? "http://localhost:3000";

  try {
    const upstream = await fetch(`${serverUrl}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: body.token }),
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the Paymaster server. Please try again later." },
      { status: 502 },
    );
  }
}
