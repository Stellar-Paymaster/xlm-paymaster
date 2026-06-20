import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "");

  if (!serverUrl) {
    return NextResponse.json(
      { error: "PAYMASTER_SERVER_URL is not configured" },
      { status: 500 },
    );
  }

  const body = await request.json();

  try {
    const response = await fetch(`${serverUrl}/estimate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to call fee estimator",
      },
      { status: 500 },
    );
  }
}
