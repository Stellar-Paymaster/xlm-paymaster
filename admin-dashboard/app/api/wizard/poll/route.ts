import { NextResponse } from "next/server";

interface HealthFeePayer {
  totalUses: number;
}

interface HealthResponse {
  fee_payers: HealthFeePayer[];
}

/**
 * GET /api/wizard/poll
 *
 * Returns the cumulative fee-bump count across all signers by summing
 * `totalUses` from the server's /health endpoint.  The quickstart wizard
 * polls this every few seconds; when the count rises above the baseline
 * captured when the user entered Step 3, the wizard marks the first bump
 * as detected.
 */
export async function GET() {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "");

  if (!serverUrl) {
    return NextResponse.json({ count: 0 });
  }

  try {
    const res = await fetch(`${serverUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return NextResponse.json({ count: 0 });
    }

    const body = (await res.json()) as HealthResponse;
    const count = (body.fee_payers ?? []).reduce(
      (sum, fp) => sum + (fp.totalUses ?? 0),
      0,
    );

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
