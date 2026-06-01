import type { Request, Response } from "express";

type AllowedScheme = "https" | "http" | "mailto";

export interface SecurityTxtOptions {
  contacts: string[];
  expires: Date;
  preferredLanguages?: string;
  canonical?: string[];
  policy?: string[];
  acknowledgments?: string[];
  encryption?: string[];
  hiring?: string[];
}

function hasControlChars(value: string): boolean {
  // Disallow CR/LF to prevent header/value injection into the file.
  return /[\u0000-\u001F\u007F]/.test(value);
}

function sanitizeScalar(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (hasControlChars(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function parseCommaList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => sanitizeScalar(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function validateUri(value: string, allowed: AllowedScheme[]): boolean {
  const scheme = value.split(":", 1)[0]?.toLowerCase();
  if (!scheme || !allowed.includes(scheme as AllowedScheme)) {
    return false;
  }

  if (scheme === "mailto") {
    // Accept a conservative subset: mailto:user@example.com (with optional query)
    return /^mailto:[^\s@]+@[^\s@]+(\?.*)?$/i.test(value);
  }

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.host);
  } catch {
    return false;
  }
}

function normalizeUrlList(values: string[], allowed: AllowedScheme[]): string[] {
  return values.filter((value) => validateUri(value, allowed));
}

function resolveExpiresFromEnv(): Date {
  const rawExpires = sanitizeScalar(process.env.SECURITY_TXT_EXPIRES);
  if (rawExpires) {
    const parsed = new Date(rawExpires);
    if (Number.isFinite(parsed.getTime()) && parsed.getTime() > Date.now()) {
      return parsed;
    }
  }

  const rawDays = sanitizeScalar(process.env.SECURITY_TXT_EXPIRES_IN_DAYS);
  const days = rawDays ? Number.parseInt(rawDays, 10) : 365;
  const safeDays = Number.isFinite(days) && days > 0 ? days : 365;
  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);
}

function buildDefaultContacts(): string[] {
  // Safe default for open-source repo disclosure.
  return ["https://github.com/Stellar-Fluid/fluid/security/advisories/new"];
}

function buildDefaultPolicy(): string[] {
  return ["https://github.com/Stellar-Fluid/fluid/security/policy"];
}

export function getSecurityTxtOptionsFromEnv(): SecurityTxtOptions {
  const contacts = normalizeUrlList(
    parseCommaList(process.env.SECURITY_TXT_CONTACTS),
    ["https", "http", "mailto"],
  );

  const canonical = normalizeUrlList(
    parseCommaList(process.env.SECURITY_TXT_CANONICAL_URLS),
    ["https", "http"],
  );

  const policy = normalizeUrlList(
    parseCommaList(process.env.SECURITY_TXT_POLICY_URLS),
    ["https", "http"],
  );

  const acknowledgments = normalizeUrlList(
    parseCommaList(process.env.SECURITY_TXT_ACKNOWLEDGMENTS_URLS),
    ["https", "http"],
  );

  const encryption = normalizeUrlList(
    parseCommaList(process.env.SECURITY_TXT_ENCRYPTION_URLS),
    ["https", "http"],
  );

  const hiring = normalizeUrlList(
    parseCommaList(process.env.SECURITY_TXT_HIRING_URLS),
    ["https", "http"],
  );

  const preferredLanguages = sanitizeScalar(
    process.env.SECURITY_TXT_PREFERRED_LANGUAGES,
  );

  return {
    contacts: contacts.length > 0 ? contacts : buildDefaultContacts(),
    expires: resolveExpiresFromEnv(),
    preferredLanguages: preferredLanguages || "en",
    canonical: canonical.length > 0 ? canonical : undefined,
    policy: policy.length > 0 ? policy : buildDefaultPolicy(),
    acknowledgments: acknowledgments.length > 0 ? acknowledgments : undefined,
    encryption: encryption.length > 0 ? encryption : undefined,
    hiring: hiring.length > 0 ? hiring : undefined,
  };
}

function formatRfc3339(date: Date): string {
  // toISOString() is RFC3339-compatible (UTC).
  return date.toISOString();
}

export function buildSecurityTxt(options: SecurityTxtOptions): string {
  const lines: string[] = [];

  for (const contact of options.contacts) {
    lines.push(`Contact: ${contact}`);
  }

  lines.push(`Expires: ${formatRfc3339(options.expires)}`);

  if (options.preferredLanguages) {
    lines.push(`Preferred-Languages: ${options.preferredLanguages}`);
  }

  for (const url of options.canonical ?? []) {
    lines.push(`Canonical: ${url}`);
  }
  for (const url of options.policy ?? []) {
    lines.push(`Policy: ${url}`);
  }
  for (const url of options.acknowledgments ?? []) {
    lines.push(`Acknowledgments: ${url}`);
  }
  for (const url of options.encryption ?? []) {
    lines.push(`Encryption: ${url}`);
  }
  for (const url of options.hiring ?? []) {
    lines.push(`Hiring: ${url}`);
  }

  // Ensure trailing newline for POSIX-friendly text files.
  return `${lines.join("\n")}\n`;
}

export function securityTxtHandler(_req: Request, res: Response): void {
  const enabledRaw = sanitizeScalar(process.env.SECURITY_TXT_ENABLED);
  const enabled = enabledRaw ? enabledRaw.toLowerCase() !== "false" : true;

  if (!enabled) {
    res.status(404).send("Not found\n");
    return;
  }

  const options = getSecurityTxtOptionsFromEnv();
  const body = buildSecurityTxt(options);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(body);
}
