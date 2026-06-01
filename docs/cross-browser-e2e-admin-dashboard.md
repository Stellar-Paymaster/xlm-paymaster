# Cross-Browser E2E Tests for Admin Dashboard (#722)

Playwright is configured to run E2E tests across Chromium, Firefox, WebKit (Safari), and mobile viewports.

## Browser matrix

| Project | Engine | Device |
|---------|--------|--------|
| chromium | Chrome | Desktop Chrome |
| firefox | Firefox | Desktop Firefox |
| webkit | Safari | Desktop Safari |
| mobile-chrome | Chrome | Pixel 5 |
| mobile-safari | WebKit | iPhone 13 |

## Test suites

| Spec | Coverage |
|------|----------|
| `e2e/auth.spec.ts` | Login page, redirect, invalid credentials, authenticated dashboard |
| `e2e/settings.spec.ts` | Settings form fields, input, save/reset buttons |
| `e2e/tables.spec.ts` | Table preview, transactions/signers preview, mobile layout |
| `e2e/referral-program.spec.ts` | Referral programme (existing) |

## Running tests

```bash
cd admin-dashboard

# Install browsers (first time)
npx playwright install --with-deps chromium firefox webkit

# All browsers
npm run test:e2e

# Chromium only (faster local iteration)
npm run test:e2e:chromium
```

## Configuration

- `playwright.config.ts` — projects, webServer, globalSetup
- `e2e/global-setup.ts` — authenticates admin user and saves `storageState`
- Default base URL: `http://127.0.0.1:3001` (matches `npm run dev`)

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ADMIN_EMAIL` | E2E admin login email |
| `ADMIN_PASSWORD` | E2E admin plain-text password |
| `AUTH_SECRET` | NextAuth JWT secret |
| `PLAYWRIGHT_BASE_URL` | Override target URL |
| `PLAYWRIGHT_SKIP_WEBSERVER` | Skip auto-starting dev server |
