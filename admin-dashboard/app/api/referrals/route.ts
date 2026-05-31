import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { lookupByCode, recordReferral, getReferralData, getOrCreateCode } from "@/lib/referral-data";

const REF_COOKIE = "fluid_ref";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * GET /api/referrals?tenantId=xxx
 * Returns referral data for a tenant (their code, history, totals).
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }
  const data = getReferralData(tenantId);
  return NextResponse.json(data);
}

/**
 * POST /api/referrals/attribute
 * Called during sign-up to set the attribution cookie when a valid ref code is present.
 * Body: { refCode: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { refCode, newTenantId } = (body ?? {}) as Record<string, unknown>;

  // ── Set attribution cookie ────────────────────────────────────────────────
  if (typeof refCode === "string" && !newTenantId) {
    const referrerId = lookupByCode(refCode);
    if (!referrerId) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(REF_COOKIE, refCode, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  }

  // ── Record attribution on account creation ────────────────────────────────
  if (typeof newTenantId === "string") {
    const cookieStore = await cookies();
    const refCookie = cookieStore.get(REF_COOKIE)?.value;
    if (!refCookie) {
      return NextResponse.json({ attributed: false });
    }
    const referrerId = lookupByCode(refCookie);
    if (!referrerId) {
      return NextResponse.json({ attributed: false });
    }
    const event = recordReferral(referrerId, newTenantId);
    const res = NextResponse.json({ attributed: true, referralId: event.id });
    // Clear the cookie after attribution
    res.cookies.set(REF_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }

  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}
