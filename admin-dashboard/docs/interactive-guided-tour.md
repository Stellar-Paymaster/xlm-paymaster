# Interactive Guided Tour for New Admins

The admin dashboard now includes a first-login guided tour that highlights the three actions new operators need most:

1. Create a key from the API key management entry point.
2. Manage the signer pool from the dashboard shortcut.
3. Configure billing and quota from the billing shortcut.

## Behavior

- The tour opens automatically on the first dashboard visit for a given admin user.
- Completion is stored in `localStorage` per user so the tour does not repeat after it is finished or dismissed.
- The overlay keeps the highlighted action visible and advances with `Next`, `Back`, or `Skip tour` controls.
- If the active target is unavailable, the tour falls back to a centered card instead of crashing.

## Verification

- The helper logic is covered by node-based tests in `lib/admin-guided-tour.test.ts`.
- The dashboard wiring is covered by `verification/InteractiveGuidedTour.integration.test.ts`.
- A browser screenshot was captured from `verification/interactive-guided-tour-preview.html` to document the tour presentation.
