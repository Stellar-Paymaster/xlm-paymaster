# CSV/PDF Export for Tenant Usage Leaderboard

Allows admins to export the tenant usage leaderboard table from the dashboard as a CSV spreadsheet or a branded PDF report.

## Component

An `ExportMenu` button is embedded inside `UsageLeaderboard` and is visible whenever at least one tenant row is present. Clicking **Export** opens a dropdown with two options.

## Export formats

### CSV

`exportLeaderboardToCSV(rows)` — `lib/export-leaderboard.ts`

- Columns: Rank, Tenant, Transactions, Successful, Failed, Total Cost (stroops)
- Rows sorted by total cost descending (highest spend first)
- Fields containing commas, quotes, or newlines are properly escaped
- Filename: `fluid-leaderboard-YYYY-MM-DD.csv`

### PDF

`exportLeaderboardToPDF(rows)` — `lib/export-leaderboard.ts`

- A4 portrait layout with Fluid branding header
- Auto-table grid with alternating row shading
- Cost column formatted as XLM when ≥ 10,000,000 stroops, otherwise raw stroops
- Page footer with report title and page number
- Filename: `fluid-leaderboard-YYYY-MM-DD.pdf`

## Usage

```tsx
import { exportLeaderboardToCSV, exportLeaderboardToPDF } from "@/lib/export-leaderboard";

// CSV (synchronous)
exportLeaderboardToCSV(rows);

// PDF (async — loads jsPDF lazily)
await exportLeaderboardToPDF(rows);
```

Both functions accept an optional second argument to override the filename.

## Tests

Unit tests (node:test):
```
node --test --experimental-strip-types lib/export-leaderboard.test.ts
```
