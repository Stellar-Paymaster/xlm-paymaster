import { NextRequest, NextResponse } from "next/server";

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey =
    typeof body === "object" &&
    body !== null &&
    "apiKey" in body &&
    typeof (body as { apiKey: unknown }).apiKey === "string"
      ? (body as { apiKey: string }).apiKey.trim()
      : "";

  if (!apiKey) {
    return NextResponse.json(
      { error: "apiKey is required in the request body." },
      { status: 400 }
    );
  }

  const serverUrl =
    process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "") ??
    "http://localhost:3000";

  const headers = { "x-api-key": apiKey };

  const [summaryRes, chartRes, txRes] = await Promise.all([
    fetch(`${serverUrl}/v1/usage/summary`, { headers, cache: "no-store" }),
    fetch(`${serverUrl}/v1/usage/chart?days=30`, { headers, cache: "no-store" }),
    fetch(`${serverUrl}/v1/usage/transactions?limit=50`, {
      headers,
      cache: "no-store",
    }),
  ]);

  if (!summaryRes.ok) {
    const payload = (await readJsonSafe(summaryRes)) as { error?: string } | null;
    const status =
      summaryRes.status === 401 || summaryRes.status === 403
        ? summaryRes.status
        : 502;
    return NextResponse.json(
      {
        error:
          (payload && typeof payload.error === "string" && payload.error) ||
          "Failed to load usage summary from Fluid API.",
      },
      { status }
    );
  }

  if (!chartRes.ok || !txRes.ok) {
    return NextResponse.json(
      { error: "Fluid API returned an error for chart or transactions." },
      { status: 502 }
    );
  }

  const [summary, chart, transactions] = await Promise.all([
    summaryRes.json() as Promise<unknown>,
    chartRes.json() as Promise<unknown>,
    txRes.json() as Promise<unknown>,
  ]);

  return NextResponse.json({ summary, chart, transactions });
}
