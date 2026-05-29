# Content Security Policy (CSP)

To comply with high-level security standards, protect the Fluid Admin Dashboard from Cross-Site Scripting (XSS), and prevent arbitrary script injection, the Fluid platform enforces a strict Content Security Policy (CSP).

---

## Architecture & Design

The CSP is implemented as a global Express middleware in the backend server. The key features of our security policy are:

1. **Unique Cryptographic Nonces**:
   For every incoming request, the server generates a cryptographically secure random base64 string (`nonce`).
   - The nonce is attached to `res.locals.nonce` for page rendering engines.
   - The nonce is included in the CSP header for `script-src` and `style-src`.
2. **Strict Guidelines**:
   - `default-src 'self'`: Disallows loading resources from external domains by default.
   - `script-src 'self' 'nonce-{nonce}' 'strict-dynamic'`: Restricts script execution strictly to those with the matching nonce or loaded dynamically via trusted scripts.
   - `style-src 'self' 'unsafe-inline' 'nonce-{nonce}'`: Ensures page styling remains functional while restricting external style sheets.
   - `object-src 'none'`: Prevents execution of object, embed, and applet plugins.
   - `base-uri 'self'`: Mitigates `<base>` tag injection attacks.
   - `frame-ancestors 'none'`: Prevents clickjacking by disallowing framing of the application.

---

## Exclusion / Relaxation Policies

Certain endpoints require running dynamic, pre-compiled frontend assets that utilize inline scripting or styles that are not nonce-aware. To prevent functionality breakage, a **relaxed CSP** is applied to:
- **Swagger Documentation** (`/docs` and `/docs.json`)
- **Bull Board Queue Admin** (`/admin/queues/*`)

The relaxed CSP allows `'unsafe-inline'` and `'unsafe-eval'` for script execution specifically for these paths, while keeping all other resource access guidelines strict.

---

## Verification & Auditing

You can audit the CSP headers of your responses using browser DevTools or `curl`:
```bash
curl -I http://localhost:3000/health
```

Expected response headers:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-Z2VuZXJhdGVkX25vbmNlX2hlcmU=' 'strict-dynamic'; style-src 'self' 'unsafe-inline' 'nonce-Z2VuZXJhdGVkX25vbmNlX2hlcmU='; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
```
