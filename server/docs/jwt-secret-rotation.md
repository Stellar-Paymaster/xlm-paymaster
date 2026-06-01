# JWT Secret Rotation

The Fluid platform supports multi-key rotation for Admin Session JWTs. This ensures that a primary secret can be rotated gracefully without immediately invalidating all active sessions.

## Configuration

JWT secrets are managed using environment variables.

### `FLUID_ADMIN_JWT_SECRETS`
You should define this variable as a comma-separated list of secrets in your environment configuration.

- The **first** secret in the list is the **primary secret** and will be used to `sign` all newly issued JWT tokens.
- All secrets in the list will be used to attempt to `verify` incoming tokens.
- We will iterate through the list until a secret successfully validates the token.

Example:
```env
FLUID_ADMIN_JWT_SECRETS="new-super-secret,old-secret-1,old-secret-2"
```

### Legacy Configuration (`FLUID_ADMIN_JWT_SECRET`)
For backwards compatibility, if `FLUID_ADMIN_JWT_SECRETS` is not set or is empty, the system will fall back to using `FLUID_ADMIN_JWT_SECRET`. If neither is provided, it uses a default development secret (`dev-admin-jwt-secret`).

## Rotation Procedure

To rotate your JWT secrets without disrupting active user sessions:
1. Generate a new high-entropy secret.
2. Update the `FLUID_ADMIN_JWT_SECRETS` environment variable by prepending the new secret to the list.
3. Deploy the application. All new tokens will now be signed with the new secret, while existing tokens will still be validated against the older secrets.
4. Once all active sessions using the oldest secret expire (tokens expire in 8 hours), you can remove the oldest secret from the list.

## Security Considerations

- Keep the number of active secrets relatively small to avoid a performance penalty during token verification, though the iteration is fast.
- Store secrets securely in a vault or secret manager instead of plain text files when possible.
