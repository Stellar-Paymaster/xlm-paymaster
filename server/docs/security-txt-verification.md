# security.txt verification report

This report captures a verified local test run for the `security.txt` implementation.

## Test run (verified output)

Command (run from `server/`):

```bash
corepack pnpm exec vitest run src/handlers/securityTxt.test.ts --coverage
```

Output:

```text
 RUN  v4.1.4 C:/Users/HP/Desktop/fluid/server
      Coverage enabled with v8

 ✓ src/handlers/securityTxt.test.ts (9 tests) 67ms
   ✓ security.txt (9)
     ✓ buildSecurityTxt formats required fields and ends with newline 7ms
     ✓ buildSecurityTxt includes optional URL directives when provided 1ms
     ✓ getSecurityTxtOptionsFromEnv falls back to GitHub disclosure contact/policy 1ms
     ✓ rejects newline/control-char injection in env lists 1ms
     ✓ drops invalid URLs and falls back when only invalid contacts provided 1ms
     ✓ uses explicit SECURITY_TXT_EXPIRES when valid and ignores whitespace-only scalars 1ms
     ✓ serves /.well-known/security.txt with correct headers and body 37ms
     ✓ aliases /security.txt to the same handler 7ms
     ✓ returns 404 when disabled via SECURITY_TXT_ENABLED=false 7ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  22:50:04
   Duration  1.11s (transform 102ms, setup 0ms, import 582ms, tests 67ms, environment 0ms)

 % Coverage report from v8
----------------|---------|----------|---------|---------|-------------------
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------|---------|----------|---------|---------|-------------------
All files       |     100 |    89.83 |     100 |     100 |
 securityTxt.ts |     100 |    89.83 |     100 |     100 | 61,81,136-138,182
----------------|---------|----------|---------|---------|-------------------
```

## Endpoint verification (for required screenshots)

Note: the main server imports the Prisma SQLite adapter (`@prisma/adapter-better-sqlite3`) at startup via `src/utils/db.ts`, which may require native build tooling on some Windows setups (Python + C++ build tools) depending on your Node version.

To capture functional screenshots, run the server and hit the endpoints:

1) Start the server (example):

```bash
corepack pnpm dev
```

2) Verify in a browser (screenshot):

- `http://localhost:3000/.well-known/security.txt`
- `http://localhost:3000/security.txt`

3) Or verify via curl (copy terminal output into PR):

```bash
curl -i http://localhost:3000/.well-known/security.txt
curl -i http://localhost:3000/security.txt
```

Expected headers include:

- `Content-Type: text/plain; charset=utf-8`
- `X-Content-Type-Options: nosniff`
