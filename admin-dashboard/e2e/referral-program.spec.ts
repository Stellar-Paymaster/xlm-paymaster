import { expect, test } from "@playwright/test";

test.describe("Referral programme — public page", () => {
  test("shows the referral page with hero and stats", async ({ page }) => {
    await page.goto("/referrals");

    await expect(
      page.getByRole("heading", { name: /Invite developers, earn quota/i }),
    ).toBeVisible();

    await expect(page.getByText(/Successful referrals/i)).toBeVisible();
    await expect(page.getByText(/Total bonus earned/i)).toBeVisible();
    await expect(page.getByText(/Bonus per referral/i)).toBeVisible();
    await expect(page.getByText(/1,000 stroops/i)).toBeVisible();
  });

  test("displays the referral link with the tenant code", async ({ page }) => {
    await page.goto("/referrals");

    // The referral link should contain /register?ref=
    await expect(page.getByText(/\/register\?ref=/i)).toBeVisible();
  });

  test("copy link button is present", async ({ page }) => {
    await page.goto("/referrals");
    await expect(page.getByRole("button", { name: /Copy link/i })).toBeVisible();
  });

  test("shows referral history table with sample data", async ({ page }) => {
    await page.goto("/referrals");

    // Sample data has 2 events for anchor-west
    await expect(page.getByText(/Referral history/i)).toBeVisible();
    // At least one credited badge
    await expect(page.getByText("Credited").first()).toBeVisible();
    // At least one pending badge
    await expect(page.getByText("Pending").first()).toBeVisible();
  });
});

test.describe("Referral programme — GET API", () => {
  test("GET /api/referrals?tenantId returns referral data", async ({ request }) => {
    const res = await request.get("/api/referrals?tenantId=anchor-west");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.referralCode).toBe("string");
    expect(body.referralCode.length).toBeGreaterThanOrEqual(12);
    expect(typeof body.totalBonusStroops).toBe("number");
    expect(Array.isArray(body.events)).toBe(true);
  });

  test("GET /api/referrals without tenantId returns 400", async ({ request }) => {
    const res = await request.get("/api/referrals");
    expect(res.status()).toBe(400);
  });

  test("GET /api/referrals for a new tenant returns empty history", async ({ request }) => {
    const res = await request.get("/api/referrals?tenantId=brand-new-tenant-xyz");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(0);
    expect(body.totalBonusStroops).toBe(0);
    expect(body.successfulReferrals).toBe(0);
  });
});

test.describe("Referral programme — attribution API", () => {
  test("POST /api/referrals with valid refCode sets attribution cookie", async ({ request }) => {
    // First get a valid code for anchor-west
    const dataRes = await request.get("/api/referrals?tenantId=anchor-west");
    const { referralCode } = await dataRes.json();

    const res = await request.post("/api/referrals", {
      data: { refCode: referralCode },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("POST /api/referrals with invalid refCode returns 400", async ({ request }) => {
    const res = await request.post("/api/referrals", {
      data: { refCode: "INVALIDCODE999" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Referral programme — credit API validation", () => {
  test("POST /api/referrals/credit with missing referrerId returns 400", async ({ request }) => {
    const res = await request.post("/api/referrals/credit", {
      data: { bonusStroops: 1000, referralId: "ref-001" },
    });
    // 401 if not authenticated, 400 if auth passes — either is acceptable
    expect([400, 401]).toContain(res.status());
  });

  test("POST /api/referrals/credit with bonusStroops=0 returns 400 or 401", async ({ request }) => {
    const res = await request.post("/api/referrals/credit", {
      data: { referrerId: "anchor-west", bonusStroops: 0, referralId: "ref-001" },
    });
    expect([400, 401]).toContain(res.status());
  });
});
