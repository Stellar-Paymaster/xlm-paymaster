import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type FullConfig } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, ".auth", "admin.json");

export default async function globalSetup(config: FullConfig): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? "e2e-admin@fluid.dev";
  const password = process.env.ADMIN_PASSWORD ?? "e2e-test-password";
  const authSecret =
    process.env.AUTH_SECRET ?? "e2e-test-auth-secret-min-32-chars-long";

  process.env.AUTH_SECRET = authSecret;
  process.env.ADMIN_EMAIL = email;
  process.env.ADMIN_PASSWORD_HASH =
    process.env.ADMIN_PASSWORD_HASH ?? bcrypt.hashSync(password, 4);

  const baseURL =
    config.projects[0]?.use?.baseURL?.toString() ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://127.0.0.1:3001";

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/login`);
  await page.getByPlaceholder(/email address/i).fill(email);
  await page.getByPlaceholder(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL(/\/admin\/dashboard/, { timeout: 60_000 });

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });

  await browser.close();
}
