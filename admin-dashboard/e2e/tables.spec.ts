import { test, expect } from "@playwright/test";

test.describe("Responsive data tables", () => {
  test("table preview page renders transactions and signers sections", async ({ page }) => {
    await page.goto("/table-preview");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: /responsive data tables/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/transactions/i).first()).toBeVisible();
    await expect(page.getByText(/signers/i).first()).toBeVisible();
  });

  test("transactions table shows sample rows on desktop", async ({ page }) => {
    await page.goto("/table-preview");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("table").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  test("tables are scrollable on mobile viewports", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only layout check");

    await page.goto("/table-preview");
    await expect(page.getByRole("heading", { name: /responsive data tables/i })).toBeVisible({
      timeout: 15_000,
    });

    const main = page.locator("main");
    const box = await main.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(500);
  });
});

test.describe("Admin tables (authenticated)", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test.beforeEach(async () => {
    const fs = await import("node:fs");
    if (!fs.existsSync("e2e/.auth/admin.json")) {
      test.skip(true, "Run global setup first (npm run test:e2e)");
    }
  });

  test("transactions preview page loads", async ({ page }) => {
    await page.goto("/transactions-preview");
    await expect(page.getByRole("heading", { name: /transaction history table/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("signers preview page loads keypool management UI", async ({ page }) => {
    await page.goto("/signers-preview");
    await expect(page.getByRole("heading", { name: /keypool management/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
