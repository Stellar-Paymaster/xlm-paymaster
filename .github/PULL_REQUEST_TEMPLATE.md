## Description

<!-- What does this PR do? Summarise the change and link the relevant issue. -->

Closes #<!-- issue number -->

---

## Type of change

<!-- Check all that apply -->

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `perf` — performance improvement
- [ ] `refactor` — code change with no feature/fix impact
- [ ] `docs` — documentation only
- [ ] `chore` — tooling, CI, dependencies
- [ ] `test` — tests only

---

## How has this been tested?

<!-- Describe what you tested and how. Link to test files where relevant. -->

- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing (describe steps below)
- [ ] Parity check (`npm run parity:rust`)
- [ ] E2E tests (`playwright test`)

**Manual test steps:**

1.
2.
3.

---

## Evidence

<!-- REQUIRED for any PR that changes runtime behaviour.
     Attach a screenshot, paste a log snippet, or show test output.
     PRs without evidence will not be approved. -->

```
# paste log / test output here
```

---

## Screenshots (if applicable)

<!-- For UI changes, include before/after screenshots. -->

| Before | After |
|--------|-------|
|        |       |

---

## Checklist

- [ ] My branch was created from `main` (`git checkout -b ... origin/main`)
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/) format
- [ ] All CI checks pass (lint, type-check, tests)
- [ ] New environment variables are documented in `.env.example`
- [ ] ADR updated or created in `docs/adr/` if this is a significant architectural change
- [ ] PR description includes evidence (screenshot, log, or test output)
- [ ] I have reviewed my own diff before requesting review
