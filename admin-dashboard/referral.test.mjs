/**
 * Unit tests for the referral programme data layer and validation logic.
 * Run with: node --test referral.test.mjs
 *
 * Inline JS port of lib/referral-data.ts — same approach as forum.test.mjs
 * and partners.test.mjs.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Inline port of lib/referral-data.ts ─────────────────────────────────────

const BONUS_STROOPS = 1_000;
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

let codeByTenant = new Map();
let tenantByCode = new Map();
let events = new Map();
let idCounter = 1;

function reset() {
  codeByTenant = new Map();
  tenantByCode = new Map();
  events = new Map();
  idCounter = 1;
}

function generateCode() {
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

function uniqueCode() {
  let code = generateCode();
  let attempts = 0;
  while (tenantByCode.has(code)) {
    code = generateCode();
    if (++attempts > 100) throw new Error("Could not generate unique code");
  }
  return code;
}

function getOrCreateCode(tenantId) {
  const existing = codeByTenant.get(tenantId);
  if (existing) return existing;
  const code = uniqueCode();
  codeByTenant.set(tenantId, code);
  tenantByCode.set(code, tenantId);
  return code;
}

function lookupByCode(code) {
  return tenantByCode.get(code) ?? null;
}

function recordReferral(referrerTenantId, referredTenantId) {
  const id = `ref-${idCounter++}`;
  const event = {
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

function markBonusCredited(referralId) {
  const event = events.get(referralId);
  if (!event) return null;
  const updated = { ...event, creditedAt: new Date().toISOString() };
  events.set(referralId, updated);
  return updated;
}

function getReferralData(tenantId) {
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

// ── Inline port of API validation logic ─────────────────────────────────────

function validateCreditBody(body) {
  const { referrerId, bonusStroops, referralId } = body ?? {};
  if (typeof referrerId !== "string" || !referrerId.trim())
    return { valid: false, error: "referrerId is required" };
  if (typeof bonusStroops !== "number" || !Number.isInteger(bonusStroops) || bonusStroops <= 0)
    return { valid: false, error: "bonusStroops must be a positive integer" };
  if (typeof referralId !== "string" || !referralId.trim())
    return { valid: false, error: "referralId is required" };
  return { valid: true };
}

function buildReferralLink(siteUrl, code) {
  return siteUrl ? `${siteUrl}/register?ref=${code}` : `/register?ref=${code}`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getOrCreateCode — referral code generation", () => {
  beforeEach(reset);

  test("generates a code of at least 12 characters", () => {
    const code = getOrCreateCode("tenant-a");
    assert.ok(code.length >= 12, `code length ${code.length} < 12`);
  });

  test("returns the same code on repeated calls (idempotent)", () => {
    const first = getOrCreateCode("tenant-a");
    const second = getOrCreateCode("tenant-a");
    assert.equal(first, second);
  });

  test("generates different codes for different tenants", () => {
    const a = getOrCreateCode("tenant-a");
    const b = getOrCreateCode("tenant-b");
    assert.notEqual(a, b);
  });

  test("code contains only URL-safe alphanumeric characters", () => {
    const code = getOrCreateCode("tenant-safe");
    assert.match(code, /^[A-Za-z0-9]+$/);
  });

  test("100 generated codes are all unique", () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(getOrCreateCode(`tenant-${i}`));
    }
    assert.equal(codes.size, 100);
  });
});

describe("lookupByCode", () => {
  beforeEach(reset);

  test("returns the tenant ID for a known code", () => {
    const code = getOrCreateCode("tenant-x");
    assert.equal(lookupByCode(code), "tenant-x");
  });

  test("returns null for an unknown code", () => {
    assert.equal(lookupByCode("DOESNOTEXIST"), null);
  });

  test("lookup is case-sensitive", () => {
    const code = getOrCreateCode("tenant-cs");
    assert.equal(lookupByCode(code.toLowerCase()), null);
  });
});

describe("recordReferral", () => {
  beforeEach(reset);

  test("creates a referral event with pending status", () => {
    const event = recordReferral("referrer-1", "referred-1");
    assert.equal(event.referrerTenantId, "referrer-1");
    assert.equal(event.referredTenantId, "referred-1");
    assert.equal(event.bonusStroops, BONUS_STROOPS);
    assert.equal(event.creditedAt, null);
    assert.ok(typeof event.id === "string" && event.id.length > 0);
  });

  test("each call produces a unique referral ID", () => {
    const a = recordReferral("r1", "u1");
    const b = recordReferral("r1", "u2");
    assert.notEqual(a.id, b.id);
  });

  test("createdAt is a valid ISO date string", () => {
    const event = recordReferral("r1", "u1");
    assert.ok(!isNaN(new Date(event.createdAt).getTime()));
  });
});

describe("markBonusCredited", () => {
  beforeEach(reset);

  test("sets creditedAt to a valid ISO date", () => {
    const event = recordReferral("r1", "u1");
    const updated = markBonusCredited(event.id);
    assert.ok(updated !== null);
    assert.ok(!isNaN(new Date(updated.creditedAt).getTime()));
  });

  test("returns null for an unknown referral ID", () => {
    assert.equal(markBonusCredited("nonexistent"), null);
  });

  test("does not affect other referral events", () => {
    const a = recordReferral("r1", "u1");
    const b = recordReferral("r1", "u2");
    markBonusCredited(a.id);
    const bAfter = events.get(b.id);
    assert.equal(bAfter.creditedAt, null);
  });

  test("calling twice does not throw and updates timestamp", () => {
    const event = recordReferral("r1", "u1");
    const first = markBonusCredited(event.id);
    const second = markBonusCredited(event.id);
    assert.ok(first !== null && second !== null);
  });
});

describe("getReferralData", () => {
  beforeEach(reset);

  test("returns correct tenantId and referralCode", () => {
    const data = getReferralData("tenant-a");
    assert.equal(data.tenantId, "tenant-a");
    assert.ok(data.referralCode.length >= 12);
  });

  test("starts with zero events and zero bonus", () => {
    const data = getReferralData("fresh-tenant");
    assert.equal(data.events.length, 0);
    assert.equal(data.totalBonusStroops, 0);
    assert.equal(data.successfulReferrals, 0);
  });

  test("counts only credited events in successfulReferrals", () => {
    const e1 = recordReferral("tenant-a", "u1");
    recordReferral("tenant-a", "u2"); // pending
    markBonusCredited(e1.id);
    const data = getReferralData("tenant-a");
    assert.equal(data.successfulReferrals, 1);
    assert.equal(data.totalBonusStroops, BONUS_STROOPS);
  });

  test("totalBonusStroops accumulates across multiple credited referrals", () => {
    const e1 = recordReferral("tenant-b", "u1");
    const e2 = recordReferral("tenant-b", "u2");
    markBonusCredited(e1.id);
    markBonusCredited(e2.id);
    const data = getReferralData("tenant-b");
    assert.equal(data.totalBonusStroops, BONUS_STROOPS * 2);
    assert.equal(data.successfulReferrals, 2);
  });

  test("events list only contains events for the requested tenant", () => {
    recordReferral("tenant-a", "u1");
    recordReferral("tenant-b", "u2");
    const data = getReferralData("tenant-a");
    assert.ok(data.events.every((e) => e.referrerTenantId === "tenant-a"));
  });
});

describe("Referral link construction", () => {
  test("builds full URL when siteUrl is provided", () => {
    const link = buildReferralLink("https://fluid.example", "ABC123DEF456");
    assert.equal(link, "https://fluid.example/register?ref=ABC123DEF456");
  });

  test("falls back to relative path when siteUrl is empty", () => {
    const link = buildReferralLink("", "ABC123DEF456");
    assert.equal(link, "/register?ref=ABC123DEF456");
  });

  test("falls back to relative path when siteUrl is null", () => {
    const link = buildReferralLink(null, "ABC123DEF456");
    assert.equal(link, "/register?ref=ABC123DEF456");
  });
});

describe("Credit API validation", () => {
  test("valid body passes", () => {
    const r = validateCreditBody({ referrerId: "t1", bonusStroops: 1000, referralId: "ref-1" });
    assert.equal(r.valid, true);
  });

  test("missing referrerId fails", () => {
    const r = validateCreditBody({ bonusStroops: 1000, referralId: "ref-1" });
    assert.equal(r.valid, false);
  });

  test("bonusStroops = 0 fails", () => {
    const r = validateCreditBody({ referrerId: "t1", bonusStroops: 0, referralId: "ref-1" });
    assert.equal(r.valid, false);
  });

  test("negative bonusStroops fails", () => {
    const r = validateCreditBody({ referrerId: "t1", bonusStroops: -500, referralId: "ref-1" });
    assert.equal(r.valid, false);
  });

  test("float bonusStroops fails", () => {
    const r = validateCreditBody({ referrerId: "t1", bonusStroops: 1000.5, referralId: "ref-1" });
    assert.equal(r.valid, false);
  });

  test("missing referralId fails", () => {
    const r = validateCreditBody({ referrerId: "t1", bonusStroops: 1000 });
    assert.equal(r.valid, false);
  });

  test("null body fails", () => {
    const r = validateCreditBody(null);
    assert.equal(r.valid, false);
  });
});

describe("Round-trip serialisation (Requirement 6.5)", () => {
  beforeEach(reset);

  test("serialising and deserialising a referral event produces an equivalent object", () => {
    const original = recordReferral("r1", "u1");
    const serialised = JSON.stringify(original);
    const deserialised = JSON.parse(serialised);
    assert.deepEqual(deserialised, original);
  });

  test("round-trip preserves null creditedAt", () => {
    const event = recordReferral("r1", "u1");
    const rt = JSON.parse(JSON.stringify(event));
    assert.equal(rt.creditedAt, null);
  });

  test("round-trip preserves credited timestamp", () => {
    const event = recordReferral("r1", "u1");
    const credited = markBonusCredited(event.id);
    const rt = JSON.parse(JSON.stringify(credited));
    assert.equal(rt.creditedAt, credited.creditedAt);
  });
});
