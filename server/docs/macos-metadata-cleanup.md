# macOS Metadata Cleanup

This cleanup removes macOS Finder metadata files (`.DS_Store`) from the server workspace and prevents them from being reintroduced.

## What was done

- Removed any existing `.DS_Store` files found under `server/`.
- Added a `.DS_Store` ignore rule at the repository level so future Finder metadata files are not committed again.

## Why it matters

- `.DS_Store` files are machine-local metadata and should not be tracked in source control.
- Keeping them out of the repository avoids noisy diffs and prevents accidental cross-platform churn.

## Ongoing maintenance

- If new `.DS_Store` files appear during development, delete them before committing.
- Keep the ignore rule in place so the cleanup remains effective over time.
