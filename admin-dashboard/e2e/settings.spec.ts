import { test, expect } from "@playwright/test";

test.describe("Settings panel", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test.beforeEach(async () => {
    const fs = await import("node:fs");
    if (!fs.existsSync("e2e/.auth/admin.json")) {
      test.skip(true, "Run global setup first (npm run test:e2e:setup)");
    }
  });

  test("settings page loads fee and rate limit fields", async ({ page }) => {
    await page.goto("/admin/settings");

    await expect(page.getByText(/fee configuration/i)).toBeVisible();
    await expect(page.getByLabel(/base fee/i)).toBeVisible();
    await expect(page.getByLabel(/fee multiplier/i)).toBeVisible();
    await expect(page.getByText(/rate & quota limits/i)).toBeVisible();
    await expect(page.getByLabel(/^rate limit$/i)).toBeVisible();
  });

  test("settings form accepts input and shows save button", async ({ page }) => {
    await page.goto("/admin/settings");

    const baseFeeInput = page.locator("#base_fee");
    await baseFeeInput.clear();
    await baseFeeInput.fill("150");

    await expect(page.getByRole("button", { name: /save & hot-reload/i })).toBeEnabled();
  });

  test("reset to defaults button is present", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("button", { name: /reset to defaults/i })).toBeVisible();
  });
});
