#!/usr/bin/env node
/**
 * Monthly transparency report generator for Fluid (#256).
 *
 * Queries the Fluid database (or the /metrics Prometheus endpoint) to produce
 * a Markdown report covering the previous calendar month, then:
 *
 *  1. Writes the report to docs/reports/YYYY-MM.md
 *  2. Optionally sends it to subscribers via EMAIL_* env vars (nodemailer)
 *
 * Usage:
 *   node scripts/generate-monthly-report.mjs
 *
 * Required env vars:
 *   DATABASE_URL    — Postgres connection string (same as fluid-server)
 *
 * Optional env vars:
 *   REPORT_EMAIL_FROM   — sender address
 *   REPORT_EMAIL_TO     — comma-separated list of subscriber addresses
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS — nodemailer transport
 *   FLUID_METRICS_URL   — base URL of the Fluid server (e.g. http://localhost:3000)
 *                         used to fetch live Prometheus metrics as a fallback
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Date helpers — always report on the previous calendar month
// ---------------------------------------------------------------------------
const now = new Date();
const reportYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
const reportMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-12
const monthLabel = new Date(reportYear, reportMonth - 1, 1).toLocaleString("en-US", {
  month: "long",
  year: "numeric",
});
const slug = `${reportYear}-${String(reportMonth).padStart(2, "0")}`;

function log(msg) {
  console.log(`[report] ${new Date().toISOString()} ${msg}`);
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

/**
 * Fetch aggregate stats from the Postgres database.
 * Returns a plain stats object; falls back to zeroes if the DB is unreachable.
 */
async function collectDatabaseStats() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    log("DATABASE_URL not set — using placeholder stats");
    return null;
  }

  let pg;
  try {
    ({ default: pg } = await import("pg"));
  } catch {
    log("pg package not available — using placeholder stats");
    return null;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    const start = new Date(reportYear, reportMonth - 1, 1);
    const end = new Date(reportYear, reportMonth, 1);

    const [txRow, tenantRow, topRow] = await Promise.all([
      client.query(
        `SELECT
           COUNT(*)::int          AS total_txs,
           SUM(fee_paid_xlm)      AS total_xlm_spent
         FROM fee_bump_transactions
         WHERE created_at >= $1 AND created_at < $2`,
        [start, end]
      ),
      client.query(
        `SELECT COUNT(DISTINCT tenant_id)::int AS unique_tenants
         FROM fee_bump_transactions
         WHERE created_at >= $1 AND created_at < $2`,
        [start, end]
      ),
      client.query(
        `SELECT use_case, COUNT(*)::int AS cnt
         FROM fee_bump_transactions
         WHERE created_at >= $1 AND created_at < $2
         GROUP BY use_case
         ORDER BY cnt DESC
         LIMIT 5`,
        [start, end]
      ),
    ]);

    await client.end();

    return {
      totalTxs: txRow.rows[0]?.total_txs ?? 0,
      totalXlmSpent: parseFloat(txRow.rows[0]?.total_xlm_spent ?? "0").toFixed(4),
      uniqueTenants: tenantRow.rows[0]?.unique_tenants ?? 0,
      topUseCases: topRow.rows,
    };
  } catch (err) {
    log(`Database query failed: ${err.message}`);
    await client.end().catch(() => {});
    return null;
  }
}

/**
 * Fetch metrics from the Prometheus /metrics endpoint as a secondary source.
 */
async function collectPrometheusStats() {
  const base = process.env.FLUID_METRICS_URL;
  if (!base) return null;

  try {
    const res = await fetch(`${base}/metrics`);
    if (!res.ok) return null;
    const text = await res.text();

    const extract = (key) => {
      const match = text.match(new RegExp(`^${key}\\s+(\\S+)`, "m"));
      return match ? parseFloat(match[1]) : 0;
    };

    return {
      totalTxs: Math.round(extract("fluid_total_transactions_total")),
      failedTxs: Math.round(extract("fluid_failed_transactions_total")),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
function buildMarkdown(stats, prometheusStats) {
  const ts = new Date().toISOString();
  const totalTxs = stats?.totalTxs ?? prometheusStats?.totalTxs ?? 0;
  const totalXlmSpent = stats?.totalXlmSpent ?? "—";
  const uniqueTenants = stats?.uniqueTenants ?? "—";
  const topUseCases = stats?.topUseCases ?? [];

  const useCaseTable =
    topUseCases.length > 0
      ? [
          "| Use Case | Transactions |",
          "|---|---|",
          ...topUseCases.map((r) => `| ${r.use_case ?? "unknown"} | ${r.cnt} |`),
        ].join("\n")
      : "_No use-case data available for this period._";

  return `# Fluid Transparency Report — ${monthLabel}

> Auto-generated on ${ts}

## Summary

| Metric | Value |
|---|---|
| Total fee-bump transactions sponsored | **${totalTxs.toLocaleString()}** |
| Total XLM spent on fees | **${totalXlmSpent} XLM** |
| Unique tenants active | **${uniqueTenants}** |

## Top Use Cases

${useCaseTable}

## Notes

- All figures cover the calendar month of **${monthLabel}**.
- XLM amounts reflect network fees paid; they do not include sponsor account funding.
- Tenant counts are deduplicated by API key / tenant ID.

## Sponsor Fund Usage

Sponsor contributions received this month were allocated to:
- Infrastructure hosting (Fly.io / Railway)
- CI/CD compute minutes
- Domain and TLS certificate renewal

See the [Sponsors section](../../README.md#sponsors) of the README for how to contribute.

---

_[View all reports](./index.md) · [Fluid on GitHub](https://github.com/Stellar-Fluid/fluid)_
`;
}

// ---------------------------------------------------------------------------
// Email delivery
// ---------------------------------------------------------------------------
async function sendEmail(subject, body) {
  const {
    REPORT_EMAIL_FROM,
    REPORT_EMAIL_TO,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
  } = process.env;

  if (!REPORT_EMAIL_FROM || !REPORT_EMAIL_TO || !SMTP_HOST) {
    log("Email env vars not configured — skipping email delivery");
    return;
  }

  let nodemailer;
  try {
    ({ default: nodemailer } = await import("nodemailer"));
  } catch {
    log("nodemailer not available — skipping email delivery");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587", 10),
    secure: SMTP_PORT === "465",
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  const recipients = REPORT_EMAIL_TO.split(",").map((s) => s.trim());
  for (const to of recipients) {
    await transporter.sendMail({
      from: REPORT_EMAIL_FROM,
      to,
      subject,
      text: body,
    });
    log(`Email sent to ${to}`);
  }
}

// ---------------------------------------------------------------------------
// Index update
// ---------------------------------------------------------------------------
function updateIndex() {
  const { readFileSync } = { readFileSync: (p, e) => require("fs").readFileSync(p, e) };
  const indexPath = join(REPO_ROOT, "docs", "reports", "index.md");
  const entry = `- [${monthLabel}](./${slug}.md)`;

  if (!existsSync(indexPath)) {
    writeFileSync(
      indexPath,
      `# Fluid Monthly Transparency Reports\n\nHistorical network activity reports, newest first.\n\n${entry}\n`
    );
    return;
  }

  import("node:fs").then(({ readFileSync: rf }) => {
    const current = rf(indexPath, "utf8");
    if (current.includes(slug)) return;
    const lines = current.split("\n");
    const insertAt = lines.findIndex((l) => l.startsWith("- ["));
    if (insertAt === -1) {
      writeFileSync(indexPath, current.trimEnd() + "\n" + entry + "\n");
    } else {
      lines.splice(insertAt, 0, entry);
      writeFileSync(indexPath, lines.join("\n"));
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  log(`Generating transparency report for ${monthLabel} (${slug})`);

  const [dbStats, prometheusStats] = await Promise.all([
    collectDatabaseStats(),
    collectPrometheusStats(),
  ]);

  const markdown = buildMarkdown(dbStats, prometheusStats);

  const outDir = join(REPO_ROOT, "docs", "reports");
  mkdirSync(outDir, { recursive: true });

  const outPath = join(outDir, `${slug}.md`);
  writeFileSync(outPath, markdown, "utf8");
  log(`Report written to ${outPath}`);

  updateIndex();
  await sendEmail(`Fluid Transparency Report — ${monthLabel}`, markdown);

  log("Done.");
})();
