import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page renders email and password fields", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: /admin login/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("unauthenticated access to /admin redirects to login", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("invalid credentials show error message", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.locator("#email").fill("wrong@example.com");
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Authenticated admin session", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test.beforeEach(async () => {
    const fs = await import("node:fs");
    if (!fs.existsSync("e2e/.auth/admin.json")) {
      test.skip(true, "Run global setup first (npm run test:e2e)");
    }
  });

  test("authenticated user reaches admin dashboard", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });
});
