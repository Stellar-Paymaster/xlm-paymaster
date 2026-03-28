import { describe, it, expect } from "vitest";
import { renderDigestEmail } from "./digestTemplate";
import type { DigestStats } from "./digestAggregator";

function makeStats(overrides: Partial<DigestStats> = {}): DigestStats {
  return {
    date: "2025-06-14",
    totalTransactions: 42,
    totalXlmSpent: 3.14159,
    topTenant: {
      tenantId: "acme-corp",
      transactionCount: 27,
      totalFeeStroops: BigInt(21_000_000),
    },
    alertsTriggered: [],
    ...overrides,
  };
}

describe("renderDigestEmail", () => {
  it("includes the correct date in the subject", () => {
    const { subject } = renderDigestEmail(makeStats());
    expect(subject).toBe("[Fluid] Daily digest — 2025-06-14");
  });

  it("includes total transactions in HTML and text", () => {
    const { html, text } = renderDigestEmail(makeStats({ totalTransactions: 99 }));
    expect(html).toContain("99");
    expect(text).toContain("99");
  });

  it("includes XLM spent in HTML", () => {
    const { html } = renderDigestEmail(makeStats({ totalXlmSpent: 1.5 }));
    // The formatter will produce "1.50" or "1.5"
    expect(html).toMatch(/1\.5/);
  });

  it("includes top tenant ID in HTML", () => {
    const { html } = renderDigestEmail(makeStats());
    expect(html).toContain("acme-corp");
  });

  it("omits top tenant section when topTenant is null", () => {
    const { html } = renderDigestEmail(makeStats({ topTenant: null }));
    expect(html).not.toContain("Top Tenant by Volume");
  });

  it("renders alerts section when alerts are present", () => {
    const { html, text } = renderDigestEmail(
      makeStats({ alertsTriggered: ["Low balance on GFAKE", "5xx spike"] }),
    );
    expect(html).toContain("Alerts triggered");
    expect(html).toContain("Low balance on GFAKE");
    expect(html).toContain("5xx spike");
    expect(text).toContain("Alerts triggered");
  });

  it("omits alerts section when no alerts", () => {
    const { html } = renderDigestEmail(makeStats({ alertsTriggered: [] }));
    expect(html).not.toContain("Alerts triggered");
  });

  it("includes dashboard link when dashboardUrl is provided", () => {
    const { html, text } = renderDigestEmail(makeStats(), {
      dashboardUrl: "https://dashboard.example.com",
    });
    expect(html).toContain("https://dashboard.example.com");
    expect(text).toContain("https://dashboard.example.com");
  });

  it("includes unsubscribe link when unsubscribeUrl is provided", () => {
    const { html, text } = renderDigestEmail(makeStats(), {
      unsubscribeUrl: "https://dashboard.example.com/admin/digest/unsubscribe?email=a@b.com&token=abc",
    });
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("admin/digest/unsubscribe");
    expect(text).toContain("admin/digest/unsubscribe");
  });

  it("escapes HTML entities in tenant ID", () => {
    const { html } = renderDigestEmail(
      makeStats({
        topTenant: {
          tenantId: '<script>alert("xss")</script>',
          transactionCount: 1,
          totalFeeStroops: BigInt(100),
        },
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("plain text contains all key fields", () => {
    const { text } = renderDigestEmail(makeStats());
    expect(text).toContain("Fluid Daily Digest");
    expect(text).toContain("2025-06-14");
    expect(text).toContain("42");
    expect(text).toContain("acme-corp");
  });
});
