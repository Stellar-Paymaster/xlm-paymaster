# Contributing to Fluid

Thank you for your interest in contributing to Fluid — the multi-chain fee sponsorship platform for the Stellar network. This guide covers everything you need to go from a fresh clone to an approved pull request.

---

## Table of Contents

1. [Repository Layout](#repository-layout)
2. [Architecture Decisions](#architecture-decisions)
3. [Development Setup](#development-setup)
4. [Branching Strategy](#branching-strategy)
5. [Commit Convention](#commit-convention)
6. [Pull Request Process](#pull-request-process)
7. [Code Review Expectations](#code-review-expectations)
8. [Environment Variables](#environment-variables)
9. [Code Style](#code-style)
10. [Testing](#testing)

---

## Repository Layout

```
fluid/
├── fluid-server/        Rust signing engine — primary production backend (Axum + sqlx)
├── server/              Node.js parity server and admin API (Express + Prisma + BullMQ)
├── admin-dashboard/     Next.js 15 admin UI (React 19, Tailwind 4)
├── client/              TypeScript client library (browser + Node.js)
├── fluid-cli/           Rust CLI tool
├── fluid-py/            Python SDK (Maturin/PyO3 bindings)
├── fluid-go/            Go client library
├── proto/               Protocol Buffer definitions (gRPC contract)
└── docs/                Documentation and Architecture Decision Records
    └── adr/             ADR index and individual records
```

This is an [Nx](https://nx.dev/) monorepo. Each sub-package is independently buildable and testable.

---

## Architecture Decisions

Major architectural choices are recorded as [Architecture Decision Records](docs/adr/README.md) in `docs/adr/`. Before proposing a significant change to the tech stack, internal protocols, or cross-package APIs:

1. Check whether an existing ADR covers the area.
2. If the decision is new or changes an existing record, open a discussion or draft a new ADR alongside your pull request using [the template](docs/adr/template.md).

Key ADRs to read before contributing:

| ADR | Topic |
|-----|-------|
| [001](docs/adr/001-chain-agnostic-fee-sponsor.md) | Chain-agnostic fee-sponsor interface |
| [002](docs/adr/002-rust-signing-engine.md) | Rust signing engine rationale |
| [003](docs/adr/003-grpc-node-rust-communication.md) | gRPC bridge between Node.js and Rust |
| [004](docs/adr/004-prisma-over-raw-sql.md) | Prisma ORM selection |

---

## Development Setup

### Prerequisites

| Tool | Version |
|------|---------|
| Rust toolchain | stable (via `rustup`) |
| Node.js | 18+ |
| pnpm | 9+ |
| Docker & Docker Compose | any recent version |

### First-time setup

```bash
# 1. Clone the repository
git clone https://github.com/Stellar-Fluid/fluid.git
cd fluid

# 2. Copy environment variables
cp .env.example .env
# Fill in the required values — see .env.example comments

# 3. Install JavaScript dependencies
pnpm install

# 4. Build the Rust engine
cd fluid-server && cargo build && cd ..

# 5. Start the full local stack (Stellar Quickstart, PostgreSQL, Redis)
docker compose up

# 6. Run database migrations (Node API / Prisma)
cd server && npx prisma migrate dev
```

### Services exposed locally

| Service | URL |
|---------|-----|
| Rust engine | http://localhost:3000 |
| Node API | http://localhost:3001 |
| Admin dashboard | http://localhost:3002 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| Stellar Horizon (local) | http://localhost:8000 |

---

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Always deployable. Protected — no direct pushes. |
| `feature/<issue>-<short-description>` | New feature or enhancement. |
| `fix/<issue>-<short-description>` | Bug fix. |
| `docs/<issue>-<short-description>` | Documentation only. |
| `chore/<short-description>` | Tooling, CI, dependencies. |

**Rules:**

- Always create your branch from `main` (`git checkout -b feature/123-my-feature origin/main`).
- Keep branches short-lived — open a PR as soon as you have a reviewable diff, even if it's a draft.
- One logical change per branch. Avoid mixing features with unrelated refactors.
- Delete your branch after it is merged.

---

## Commit Convention

This project enforces **Conventional Commits** via [commitlint](https://commitlint.js.org/) — both locally (git hook) and in CI on every pull request.

### Format

```
<type>(<optional scope>): <short description>

[optional body]

[optional footer(s)]
```

### Allowed types

| Type | When to use |
|------|------------|
| `feat` | A new feature visible to users or API consumers |
| `fix` | A bug fix |
| `perf` | Performance improvement |
| `docs` | Documentation only |
| `style` | Formatting, whitespace — no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or correcting tests |
| `chore` | Build process, dependency updates, tooling |
| `ci` | CI/CD configuration |
| `revert` | Reverts a previous commit |

### Examples

```
feat(client): add Web Worker signing for offthread performance
fix(server): handle missing Horizon URL in fee-bump handler
perf(fluid-server): parallelise XDR serialisation in signing pool
docs: comprehensive contributing guide and pr template
chore(deps): bump stellar-sdk to 14.6.1
```

### Scope

Use the package name as scope when the change is isolated to one sub-package (`client`, `server`, `fluid-server`, `admin-dashboard`, `fluid-cli`, `fluid-py`, `fluid-go`). Omit scope for cross-cutting changes.

### Local enforcement

commitlint runs automatically via the `commit-msg` git hook (installed by the setup above). If a commit is rejected, amend or reset and re-word your message.

---

## Pull Request Process

1. **Open early.** Draft PRs are welcome — they invite early feedback and prevent wasted effort.
2. **Reference the issue.** Include `closes #NNN` or `relates to #NNN` in the PR description.
3. **Fill in the PR template.** The `.github/PULL_REQUEST_TEMPLATE.md` checklist must be completed before requesting review.
4. **Keep PRs focused.** One feature or fix per PR. Large changes are harder to review and slower to merge.
5. **All new environment variables** must have a matching entry in `.env.example` with an explanatory comment.
6. **Update ADRs** in `docs/adr/` for any significant architectural decision.
7. **Provide evidence.** Every PR that changes runtime behaviour must include a screenshot, log snippet, or test output proving it works. PRs without evidence will not be approved.
8. **Ensure CI passes.** Address all lint, type, and test failures before requesting review.

---

## Code Review Expectations

### For authors

- Respond to review comments within two business days.
- Prefer addressing feedback with new commits during review; squash only at merge time.
- Explain non-obvious decisions in PR comments rather than inline code comments.

### For reviewers

- Be constructive and specific. "This is wrong" is not actionable; "this will panic on empty input because…" is.
- Distinguish blocking issues (`must fix`) from suggestions (`nit:` or `consider:`).
- Approve only when you would be comfortable being on-call for the change.
- Target a first review within two business days of PR creation.

### Merge policy

- **Squash and merge** for feature and fix branches (keeps `main` history linear).
- **Merge commit** for release branches or when preserving intermediate commits matters.
- At least **one approving review** from a maintainer is required.
- All CI checks must be green.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values documented there. **Never commit secrets.**

Rules for PRs that introduce new environment variables:

1. Add an entry to `.env.example` immediately above or within the relevant section.
2. Include a comment explaining the variable's purpose, accepted values, and default.
3. Mark required variables clearly; use a safe default for optional ones.

---

## Code Style

### Rust (`fluid-server`, `fluid-core`, `fluid-cli`)

```bash
cargo fmt                          # format
cargo clippy --all-targets -- -D warnings  # lint; warnings are errors in CI
```

### TypeScript / Node.js (`server`, `client`, `admin-dashboard`)

```bash
pnpm exec nx lint <project>        # ESLint via Nx
```

Follow the ESLint configuration in each sub-package. Key conventions:

- No `any` unless unavoidable and commented with justification.
- Prefer `const` over `let`; avoid `var`.
- Comments only when the *why* is non-obvious — never describe *what* the code does.

### Python (`fluid-py`)

```bash
ruff check .
```

### Go (`fluid-go`)

```bash
go fmt ./...
go vet ./...
```

---

## Testing

### Run all tests

```bash
# Rust engine
cd fluid-server && cargo test

# Node API
cd server && npm test

# Client library
cd client && npm test

# Admin dashboard (unit + e2e)
cd admin-dashboard && npm test
cd admin-dashboard && npx playwright test

# Node ↔ Rust parity check
cd server && npm run parity:rust
```

### What tests are required?

| Change type | Required coverage |
|-------------|------------------|
| New handler / endpoint | Handler unit test + integration test |
| New service | Service unit test |
| Bug fix | Regression test that would have caught the bug |
| Performance change | Benchmark output showing improvement |
| Docs / CI | No test required |

Evidence that your change works (log output, screenshot, benchmark result) must be included in the PR description. Issues will not be closed without it.
