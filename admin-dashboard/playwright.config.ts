import { defineConfig, devices } from "@playwright/test";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";
const e2ePassword = process.env.ADMIN_PASSWORD ?? "e2e-test-password";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: path.join(__dirname, "e2e", "global-setup.ts"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          AUTH_SECRET:
            process.env.AUTH_SECRET ??
            "e2e-test-auth-secret-min-32-chars-long",
          ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "e2e-admin@paymaster.dev",
          ADMIN_PASSWORD_HASH:
            process.env.ADMIN_PASSWORD_HASH ?? bcrypt.hashSync(e2ePassword, 4),
        },
      },
});
