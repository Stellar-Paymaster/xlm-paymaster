import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { markBonusCredited } from "@/lib/referral-data";

/**
 * POST /api/referrals/credit
 * Proxies a quota-bonus credit to the Fluid backend, then marks the referral
 * as credited in the local store.
 *
 * Body: { referrerId: string; bonusStroops: number; referralId: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { referrerId, bonusStroops, referralId } = body as Record<string, unknown>;

  if (typeof referrerId !== "string" || !referrerId.trim()) {
    return NextResponse.json({ error: "referrerId is required" }, { status: 400 });
  }
  if (typeof bonusStroops !== "number" || !Number.isInteger(bonusStroops) || bonusStroops <= 0) {
    return NextResponse.json(
      { error: "bonusStroops must be a positive integer" },
      { status: 400 },
    );
  }
  if (typeof referralId !== "string" || !referralId.trim()) {
    return NextResponse.json({ error: "referralId is required" }, { status: 400 });
  }

  const serverUrl = process.env.FLUID_SERVER_URL?.trim().replace(/\/$/, "");
  const adminToken = process.env.FLUID_ADMIN_TOKEN?.trim();

  // If no backend is configured, simulate success (dev/sample mode)
  if (!serverUrl || !adminToken) {
    const updated = markBonusCredited(referralId);
    if (!updated) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, source: "sample", event: updated });
  }

  try {
    const upstream = await fetch(
      `${serverUrl}/admin/tenants/${encodeURIComponent(referrerId)}/quota-bonus`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ bonusStroops }),
      },
    );

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({ error: "Upstream error" }));
      console.error("[referrals/credit] upstream error", upstream.status, errBody);
      return NextResponse.json(errBody, { status: upstream.status });
    }

    // Only mark credited after the upstream confirms success
    const updated = markBonusCredited(referralId);
    if (!updated) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, source: "live", event: updated });
  } catch (err) {
    console.error("[referrals/credit] fetch error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to credit bonus" },
      { status: 500 },
    );
  }
}
