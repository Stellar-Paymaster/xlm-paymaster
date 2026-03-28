import type { DigestStats } from "./digestAggregator";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatXlm(xlm: number): string {
  return xlm.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

export interface DigestEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function renderDigestEmail(
  stats: DigestStats,
  options: {
    dashboardUrl?: string;
    unsubscribeUrl?: string;
  } = {},
): DigestEmailContent {
  const subject = `[Fluid] Daily digest — ${stats.date}`;

  const html = buildHtml(stats, options);
  const text = buildText(stats, options);

  return { subject, html, text };
}

// ────────────────────────────────────────────────────────────────────────────
// HTML builder
// ────────────────────────────────────────────────────────────────────────────

function buildHtml(
  stats: DigestStats,
  options: { dashboardUrl?: string; unsubscribeUrl?: string },
): string {
  const { dashboardUrl, unsubscribeUrl } = options;

  const alertsSection =
    stats.alertsTriggered.length > 0
      ? `
      <tr>
        <td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:0;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 8px;font-family:system-ui,sans-serif;font-size:14px;font-weight:700;color:#856404;">
                  ⚠️ Alerts triggered (${stats.alertsTriggered.length})
                </p>
                <ul style="margin:0;padding-left:20px;font-family:system-ui,sans-serif;font-size:13px;color:#856404;">
                  ${stats.alertsTriggered.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}
                </ul>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
      : "";

  const topTenantSection = stats.topTenant
    ? `
      <tr>
        <td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 4px;font-family:system-ui,sans-serif;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">
                  Top Tenant by Volume
                </p>
                <p style="margin:0;font-family:system-ui,sans-serif;font-size:15px;font-weight:700;color:#1e293b;">
                  ${escapeHtml(stats.topTenant.tenantId)}
                </p>
                <p style="margin:4px 0 0;font-family:system-ui,sans-serif;font-size:13px;color:#64748b;">
                  ${stats.topTenant.transactionCount.toLocaleString()} txs &middot;
                  ${formatXlm(Number(stats.topTenant.totalFeeStroops) / 10_000_000)} XLM
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const dashboardBtn = dashboardUrl
    ? `
      <tr>
        <td align="center" style="padding:0 32px 32px;">
          <a href="${escapeHtml(dashboardUrl)}"
             style="display:inline-block;background:#4f46e5;color:#fff;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px;">
            Open Dashboard →
          </a>
        </td>
      </tr>`
    : "";

  const unsubscribeFooter = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from daily digests</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Fluid Daily Digest — ${escapeHtml(stats.date)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:28px 32px;">
              <p style="margin:0;font-family:system-ui,sans-serif;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                ⚡ Fluid
              </p>
              <p style="margin:4px 0 0;font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.75);">
                Daily activity summary for ${escapeHtml(stats.date)}
              </p>
            </td>
          </tr>

          <!-- Stats cards -->
          <tr>
            <td style="padding:28px 32px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- Total Transactions -->
                  <td width="48%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;vertical-align:top;">
                    <p style="margin:0 0 4px;font-family:system-ui,sans-serif;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">
                      Transactions
                    </p>
                    <p style="margin:0;font-family:system-ui,sans-serif;font-size:28px;font-weight:800;color:#1e293b;">
                      ${stats.totalTransactions.toLocaleString()}
                    </p>
                    <p style="margin:2px 0 0;font-family:system-ui,sans-serif;font-size:12px;color:#64748b;">sponsored yesterday</p>
                  </td>
                  <td width="4%"></td>
                  <!-- XLM Spent -->
                  <td width="48%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;vertical-align:top;">
                    <p style="margin:0 0 4px;font-family:system-ui,sans-serif;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">
                      XLM Spent
                    </p>
                    <p style="margin:0;font-family:system-ui,sans-serif;font-size:28px;font-weight:800;color:#1e293b;">
                      ${formatXlm(stats.totalXlmSpent)}
                    </p>
                    <p style="margin:2px 0 0;font-family:system-ui,sans-serif;font-size:12px;color:#64748b;">in fees paid</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:20px;"></td></tr>

          <!-- Top Tenant -->
          ${topTenantSection}

          <!-- Alerts -->
          ${alertsSection}

          <!-- Dashboard button -->
          ${dashboardBtn}

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
              <p style="margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#9ca3af;">
                Fluid Operator Digest &middot; Sent automatically each day
              </p>
              ${unsubscribeFooter ? `<p style="margin:8px 0 0;font-family:system-ui,sans-serif;font-size:12px;">${unsubscribeFooter}</p>` : ""}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Plain-text fallback
// ────────────────────────────────────────────────────────────────────────────

function buildText(
  stats: DigestStats,
  options: { dashboardUrl?: string; unsubscribeUrl?: string },
): string {
  const { dashboardUrl, unsubscribeUrl } = options;
  const lines: string[] = [
    "Fluid Daily Digest",
    `Date: ${stats.date}`,
    "",
    `Total transactions sponsored: ${stats.totalTransactions.toLocaleString()}`,
    `Total XLM spent in fees:      ${formatXlm(stats.totalXlmSpent)} XLM`,
  ];

  if (stats.topTenant) {
    lines.push("");
    lines.push("Top tenant by volume:");
    lines.push(`  Tenant ID:    ${stats.topTenant.tenantId}`);
    lines.push(
      `  Transactions: ${stats.topTenant.transactionCount.toLocaleString()}`,
    );
    lines.push(
      `  XLM spent:    ${formatXlm(Number(stats.topTenant.totalFeeStroops) / 10_000_000)} XLM`,
    );
  }

  if (stats.alertsTriggered.length > 0) {
    lines.push("");
    lines.push(`Alerts triggered (${stats.alertsTriggered.length}):`);
    stats.alertsTriggered.forEach((a) => lines.push(`  • ${a}`));
  }

  if (dashboardUrl) {
    lines.push("");
    lines.push(`Dashboard: ${dashboardUrl}`);
  }

  if (unsubscribeUrl) {
    lines.push("");
    lines.push(`To unsubscribe: ${unsubscribeUrl}`);
  }

  return lines.join("\n");
}
