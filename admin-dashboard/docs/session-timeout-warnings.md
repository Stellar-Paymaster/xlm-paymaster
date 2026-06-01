# Session Timeout Warnings

Fluid admin sessions expire after 8 hours (configured in `auth.ts` via
`session.maxAge`). The session timeout warning system notifies admins before
their session expires and gives them a one-click option to extend it.

## How it works

### Warning phases

| Phase      | Trigger              | UI shown                                     |
|------------|----------------------|----------------------------------------------|
| `active`   | > 5 min remaining    | Nothing                                      |
| `warning`  | ≤ 5 min remaining    | Yellow dismissible banner (bottom of screen) |
| `critical` | ≤ 60 sec remaining   | Blocking modal with countdown                |
| `expired`  | 0 sec remaining      | Auto sign-out → redirect to `/login`         |

### Architecture

- **`lib/session-timeout.ts`** — pure, framework-agnostic logic.
  - `SessionTimeoutMonitor` — class that tracks elapsed time against the
    session's `maxAge` and fires `onWarning`, `onCritical`, and `onExpired`
    callbacks exactly once per phase transition.
  - `getPhase(secondsLeft, warnThreshold, critThreshold)` — pure function used
    by both the monitor and tests.
  - `formatTimeLeft(seconds)` — formats a countdown as `M:SS`.

- **`components/dashboard/SessionTimeoutWarning.tsx`** — React client component
  that mounts a `SessionTimeoutMonitor` when the NextAuth.js session is
  authenticated.  Calls `update()` (from `next-auth/react`) to extend the
  session JWT without a full page reload.

- **`components/providers.tsx`** — `<SessionTimeoutWarning />` is rendered
  inside `<SessionProvider>` so it has access to the session context everywhere
  in the app.

## Extending the session

When the admin clicks **Stay logged in** or **Extend session**, the component
calls NextAuth's `update()` to refresh the JWT.  The monitor's `reset()` method
is then called to restart the countdown.

## Configuration

The thresholds and tick interval are defined as named constants in
`lib/session-timeout.ts`:

| Constant                | Default | Description                         |
|-------------------------|---------|-------------------------------------|
| `SESSION_MAX_AGE_SEC`   | 28 800  | 8 hours — mirrors `auth.ts` maxAge  |
| `WARNING_THRESHOLD_SEC` | 300     | 5 minutes — show the banner         |
| `CRITICAL_THRESHOLD_SEC`| 60      | 1 minute — show the modal           |
| `TICK_INTERVAL_MS`      | 10 000  | How often to check the session      |

Pass overrides to `SessionTimeoutMonitor` if different thresholds are needed for
a specific context (e.g. shorter windows in a sandbox environment).
