import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  buildSecurityTxt,
  getSecurityTxtOptionsFromEnv,
  securityTxtHandler,
} from "./securityTxt";

describe("security.txt", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("buildSecurityTxt formats required fields and ends with newline", () => {
    const body = buildSecurityTxt({
      contacts: ["mailto:security@example.com"],
      expires: new Date("2099-01-01T00:00:00.000Z"),
      preferredLanguages: "en",
      canonical: ["https://example.com/.well-known/security.txt"],
      policy: ["https://example.com/security"],
    });

    expect(body).toContain("Contact: mailto:security@example.com\n");
    expect(body).toContain("Expires: 2099-01-01T00:00:00.000Z\n");
    expect(body).toContain("Preferred-Languages: en\n");
    expect(body).toContain("Canonical: https://example.com/.well-known/security.txt\n");
    expect(body).toContain("Policy: https://example.com/security\n");
    expect(body.endsWith("\n")).toBe(true);
  });

  it("buildSecurityTxt includes optional URL directives when provided", () => {
    const body = buildSecurityTxt({
      contacts: ["https://example.com/contact"],
      expires: new Date("2099-01-01T00:00:00.000Z"),
      preferredLanguages: undefined,
      acknowledgments: ["https://example.com/hall-of-fame"],
      encryption: ["https://example.com/pgp.txt"],
      hiring: ["https://example.com/careers"],
    });

    expect(body).toContain("Acknowledgments: https://example.com/hall-of-fame\n");
    expect(body).toContain("Encryption: https://example.com/pgp.txt\n");
    expect(body).toContain("Hiring: https://example.com/careers\n");
    expect(body).not.toContain("Preferred-Languages:");
  });

  it("getSecurityTxtOptionsFromEnv falls back to GitHub disclosure contact/policy", () => {
    vi.stubEnv("SECURITY_TXT_CONTACTS", "");
    vi.stubEnv("SECURITY_TXT_POLICY_URLS", "");
    vi.stubEnv("SECURITY_TXT_EXPIRES_IN_DAYS", "30");

    const options = getSecurityTxtOptionsFromEnv();

    expect(options.contacts[0]).toMatch(
      /^https:\/\/github\.com\/Stellar-Fluid\/fluid\/security\/advisories\/new$/,
    );
    expect(options.policy?.[0]).toMatch(
      /^https:\/\/github\.com\/Stellar-Fluid\/fluid\/security\/policy$/,
    );
    expect(options.preferredLanguages).toBe("en");
    expect(options.expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects newline/control-char injection in env lists", () => {
    vi.stubEnv(
      "SECURITY_TXT_CONTACTS",
      "mailto:good@example.com\nPolicy:https://evil.example",
    );
    vi.stubEnv("SECURITY_TXT_EXPIRES_IN_DAYS", "30");

    const options = getSecurityTxtOptionsFromEnv();
    // The injected entry should be dropped and default contact used.
    expect(options.contacts[0]).toMatch(
      /^https:\/\/github\.com\/Stellar-Fluid\/fluid\/security\/advisories\/new$/,
    );
  });

  it("drops invalid URLs and falls back when only invalid contacts provided", () => {
    // Invalid scheme and invalid mailto should both be ignored.
    vi.stubEnv("SECURITY_TXT_CONTACTS", "ftp://example.com,mailto:not-an-email");
    // Force Expires to fall back: invalid and in the past.
    vi.stubEnv("SECURITY_TXT_EXPIRES", "2000-01-01T00:00:00.000Z");
    vi.stubEnv("SECURITY_TXT_EXPIRES_IN_DAYS", "-5");
    // Malformed canonical URL that will throw in URL parsing.
    vi.stubEnv("SECURITY_TXT_CANONICAL_URLS", "https://[::1");

    const options = getSecurityTxtOptionsFromEnv();
    expect(options.contacts[0]).toMatch(
      /^https:\/\/github\.com\/Stellar-Fluid\/fluid\/security\/advisories\/new$/,
    );
    expect(options.canonical).toBeUndefined();
    expect(options.expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("uses explicit SECURITY_TXT_EXPIRES when valid and ignores whitespace-only scalars", () => {
    vi.stubEnv("SECURITY_TXT_CONTACTS", "mailto:security@example.com");
    vi.stubEnv("SECURITY_TXT_EXPIRES", "2099-01-01T00:00:00.000Z");
    vi.stubEnv("SECURITY_TXT_EXPIRES_IN_DAYS", "1");
    vi.stubEnv("SECURITY_TXT_PREFERRED_LANGUAGES", "   ");

    const options = getSecurityTxtOptionsFromEnv();
    expect(options.expires.toISOString()).toBe("2099-01-01T00:00:00.000Z");
    // whitespace-only should be ignored and default to "en"
    expect(options.preferredLanguages).toBe("en");
  });

  it("serves /.well-known/security.txt with correct headers and body", async () => {
    vi.stubEnv("SECURITY_TXT_ENABLED", "true");
    vi.stubEnv("SECURITY_TXT_CONTACTS", "mailto:security@example.com");
    vi.stubEnv("SECURITY_TXT_POLICY_URLS", "https://example.com/security");
    vi.stubEnv("SECURITY_TXT_CANONICAL_URLS", "https://example.com/.well-known/security.txt");
    vi.stubEnv("SECURITY_TXT_EXPIRES_IN_DAYS", "30");

    const app = express();
    app.get("/.well-known/security.txt", securityTxtHandler);

    const res = await request(app).get("/.well-known/security.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toContain("max-age=86400");
    expect(res.text).toContain("Contact: mailto:security@example.com");
    expect(res.text).toContain("Policy: https://example.com/security");
    expect(res.text).toContain("Canonical: https://example.com/.well-known/security.txt");
    expect(res.text).toMatch(/Expires: .+Z/);
  });

  it("aliases /security.txt to the same handler", async () => {
    vi.stubEnv("SECURITY_TXT_ENABLED", "true");
    vi.stubEnv("SECURITY_TXT_CONTACTS", "mailto:security@example.com");
    vi.stubEnv("SECURITY_TXT_EXPIRES_IN_DAYS", "30");

    const app = express();
    app.get("/security.txt", securityTxtHandler);

    const res = await request(app).get("/security.txt");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Contact: mailto:security@example.com");
  });

  it("returns 404 when disabled via SECURITY_TXT_ENABLED=false", async () => {
    vi.stubEnv("SECURITY_TXT_ENABLED", "false");
    const app = express();
    app.get("/.well-known/security.txt", securityTxtHandler);

    const res = await request(app).get("/.well-known/security.txt");
    expect(res.status).toBe(404);
    expect(res.text).toContain("Not found");
  });
});
