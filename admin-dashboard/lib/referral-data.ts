import "server-only";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReferralEvent {
  id: string;
  referrerTenantId: string;
  referredTenantId: string;
  bonusStroops: number;
  creditedAt: string | null; // ISO string when bonus was successfully credited
  createdAt: string;
}

export interface TenantReferralData {
  tenantId: string;
  referralCode: string;
  events: ReferralEvent[];
  totalBonusStroops: number;
  successfulReferrals: number;
}

// ── In-memory store ──────────────────────────────────────────────────────────
// Replace with a real DB in production.

/** tenantId → referral code */
const codeByTenant = new Map<string, string>();
/** referral code → tenantId */
const tenantByCode = new Map<string, string>();
/** referralId → ReferralEvent */
const events = new Map<string, ReferralEvent>();

const BONUS_STROOPS = 1_000;

// Seed sample data so the history page is non-empty in dev
let _seeded = false;
function seed() {
  if (_seeded) return;
  _seeded = true;

  const sampleCode = "ANCHOR001REF";
  codeByTenant.set("anchor-west", sampleCode);
  tenantByCode.set(sampleCode, "anchor-west");

  const e1: ReferralEvent = {
    id: "ref-001",
    referrerTenantId: "anchor-west",
    referredTenantId: "new-dev-aabbccdd",
    bonusStroops: BONUS_STROOPS,
    creditedAt: "2026-02-14T10:00:00Z",
    createdAt: "2026-02-14T09:55:00Z",
  };
  const e2: ReferralEvent = {
    id: "ref-002",
    referrerTenantId: "anchor-west",
    referredTenantId: "new-dev-eeff1122",
    bonusStroops: BONUS_STROOPS,
    creditedAt: null, // pending
    createdAt: "2026-03-01T14:20:00Z",
  };
  events.set(e1.id, e1);
  events.set(e2.id, e2);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function uniqueCode(): string {
  let code = generateCode();
  let attempts = 0;
  while (tenantByCode.has(code)) {
    code = generateCode();
    if (++attempts > 100) throw new Error("Could not generate unique referral code");
  }
  return code;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Returns (or lazily creates) the referral code for a tenant. */
export function getOrCreateCode(tenantId: string): string {
  seed();
  const existing = codeByTenant.get(tenantId);
  if (existing) return existing;
  const code = uniqueCode();
  codeByTenant.set(tenantId, code);
  tenantByCode.set(code, tenantId);
  return code;
}

/** Returns the tenant ID for a given referral code, or null. */
export function lookupByCode(code: string): string | null {
  seed();
  return tenantByCode.get(code) ?? null;
}

/** Returns full referral data for a tenant. */
export function getReferralData(tenantId: string): TenantReferralData {
  seed();
  const referralCode = getOrCreateCode(tenantId);
  const tenantEvents = Array.from(events.values())
    .filter((e) => e.referrerTenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const credited = tenantEvents.filter((e) => e.creditedAt !== null);

  return {
    tenantId,
    referralCode,
    events: tenantEvents,
    totalBonusStroops: credited.length * BONUS_STROOPS,
    successfulReferrals: credited.length,
  };
}

/** Records a new referral attribution (called at sign-up). */
export function recordReferral(
  referrerTenantId: string,
  referredTenantId: string,
): ReferralEvent {
  seed();
  const id = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const event: ReferralEvent = {
    id,
    referrerTenantId,
    referredTenantId,
    bonusStroops: BONUS_STROOPS,
    creditedAt: null,
    createdAt: new Date().toISOString(),
  };
  events.set(id, event);
  return event;
}

/** Marks a referral bonus as successfully credited. */
export function markBonusCredited(referralId: string): ReferralEvent | null {
  seed();
  const event = events.get(referralId);
  if (!event) return null;
  const updated: ReferralEvent = {
    ...event,
    creditedAt: new Date().toISOString(),
  };
  events.set(referralId, updated);
  return updated;
}

export const REFERRAL_BONUS_STROOPS = BONUS_STROOPS;
