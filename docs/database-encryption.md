# Database Encryption at Rest (TDE)

The Fluid server implements Transparent Data Encryption (TDE) natively at the Prisma-level for sensitive fields within the database. This ensures that even if the database is compromised, sensitive information remains thoroughly encrypted at rest.

## How It Works

We utilize a custom Prisma Client extension to automatically intercept database operations (`create`, `update`, `findUnique`, `findMany`, etc.). Sensitive fields are encrypted before executing queries and decrypted seamlessly when records map back into server memory.

The encryption uses the robust `AES-256-GCM` algorithm natively provided by Node.js.

### Encrypted Fields
By default, the following field names are automatically encrypted across all schemas/models:
- `secret`
- `apiKey`
- `token`
- `privateKey`

## Configuration

To enable encryption in production, you must set the following environment variable:

```bash
DATABASE_ENCRYPTION_KEY="<32-byte-base64-encoded-key>"
```

## Development Environment
In a local development environment (when `NODE_ENV=development`), if `DATABASE_ENCRYPTION_KEY` is omitted, the server will fallback to a static, hardcoded development key.
**Warning:** The server will actively throw an error and refuse to start if the key is missing in production environments!