# security.txt (Responsible Disclosure)

Fluid serves an RFC 9116 `security.txt` for responsible disclosure.

## Endpoints

- `/.well-known/security.txt`
- `/security.txt` (alias)

Responses are:

- `Content-Type: text/plain; charset=utf-8`
- `X-Content-Type-Options: nosniff`
- `Cache-Control: public, max-age=86400`

## Configuration

The server reads the following environment variables:

- `SECURITY_TXT_ENABLED` (default: `true`) — set to `false` to disable serving the file.
- `SECURITY_TXT_CONTACTS` — comma-separated list of `mailto:` and/or `https://` URIs.
- `SECURITY_TXT_EXPIRES` — RFC3339 timestamp (preferred for production).
- `SECURITY_TXT_EXPIRES_IN_DAYS` — rolling expiry window used when `SECURITY_TXT_EXPIRES` is unset/invalid/past (default: `365`).
- Optional lists (comma-separated URLs):
  - `SECURITY_TXT_CANONICAL_URLS`
  - `SECURITY_TXT_POLICY_URLS`
  - `SECURITY_TXT_ACKNOWLEDGMENTS_URLS`
  - `SECURITY_TXT_ENCRYPTION_URLS`
  - `SECURITY_TXT_HIRING_URLS`
- `SECURITY_TXT_PREFERRED_LANGUAGES` (default: `en`)

## Security notes

- Values containing control characters (including newlines) are ignored to prevent directive injection.
- Only `mailto:`, `http://`, and `https://` URIs are accepted; invalid entries are dropped.


