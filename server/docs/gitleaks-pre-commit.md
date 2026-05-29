# Gitleaks Pre-commit Hook

To maintain professional-grade security & compliance standards, the Fluid platform enforces secret scanning on all developer environments using [Gitleaks](https://github.com/gitleaks/gitleaks).

This prevents accidental leaks of sensitive information (e.g., API keys, private keys, tokens) into the repository.

## Requirements

- **Gitleaks** must be installed and accessible in your system's `PATH`.
  - macOS: `brew install gitleaks`
  - Linux, Windows, or Docker: See Gitleaks Installation Guide

## Usage

The pre-commit hook logic is implemented in `server/src/scripts/pre-commit-gitleaks.ts`. It runs `gitleaks protect --staged` before allowing a commit to complete.

If secrets are detected:
1. The commit will be blocked.
2. You will see a terminal output detailing the potential secret.
3. You must remove or mask the secret, restage the changes (`git add`), and commit again.

## Hook Integration

If you are using a tool like Husky, you can configure your pre-commit hook to execute this script automatically:

```bash
#!/bin/sh
npx ts-node server/src/scripts/pre-commit-gitleaks.ts
```