# Session Fixation Protection

## Summary

The admin authentication flow now enforces session fixation protection for database-backed admin users.

- Each `AdminUser` record stores a `sessionVersion`.
- Every issued admin JWT includes that `sessionVersion`.
- Protected admin routes re-check the current database record before authorizing the request.
- A password change increments `sessionVersion`, stamps `passwordChangedAt`, and returns a freshly issued JWT.
- Any previously issued JWT becomes invalid immediately after the password change.

## Protected Flow

1. `POST /admin/auth/login`
   Issues an admin JWT with the current `sessionVersion`.
2. Authenticated admin routes
   Verify the JWT signature, load the current admin user from Prisma, confirm the account is still active, and reject stale `sessionVersion` values.
3. `POST /admin/auth/change-password`
   Requires an authenticated admin JWT, validates the current password, rejects password reuse, hashes the new password, increments `sessionVersion`, and returns a rotated JWT.

## Security Notes

- Stale tokens are rejected with `401 Unauthorized`.
- Deactivated admin users also have their `sessionVersion` bumped so older JWTs cannot continue to authenticate.
- Static `x-admin-token` compatibility remains available for legacy flows, but password rotation protection applies to database-backed admin JWT sessions.
- Authorization decisions for JWT-backed admins now use the current database role, not only the role embedded at token issuance time.

## Test Coverage

Coverage added for:

- JWT signing and verification with `sessionVersion`
- Permission middleware rejection for stale tokens
- Password change success and edge cases
- End-to-end token invalidation after password rotation
