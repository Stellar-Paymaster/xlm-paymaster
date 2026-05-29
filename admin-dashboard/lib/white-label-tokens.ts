/**
 * White-label color token system for enterprise partners.
 *
 * Partners supply a WhiteLabelTokens object; the system validates it,
 * generates a scoped CSS block, and applies it to a container element so
 * the standard Tailwind/CSS-variable-driven components pick up the brand
 * colors automatically.
 */

export interface WhiteLabelTokens {
  /** Primary action color (buttons, links). */
  primary: string;
  /** Foreground on primary-colored surfaces. */
  primaryForeground: string;
  /** Secondary / neutral surface color. */
  secondary: string;
  /** Foreground on secondary-colored surfaces. */
  secondaryForeground: string;
  /** Accent highlight color. */
  accent: string;
  /** Foreground on accent-colored surfaces. */
  accentForeground: string;
  /** Page / app background. */
  background: string;
  /** Default body text color. */
  foreground: string;
  /** Card surface color. */
  card: string;
  /** Foreground on card surfaces. */
  cardForeground: string;
  /** Destructive / error color. */
  destructive: string;
  /** Foreground on destructive surfaces. */
  destructiveForeground: string;
  /** Muted surface (subtle backgrounds). */
  muted: string;
  /** Muted foreground (secondary text). */
  mutedForeground: string;
  /** Border color. */
  border: string;
  /** Input border color. */
  input: string;
  /** Focus ring color. */
  ring: string;
  /** Optional: enterprise name used in the generated comment. */
  partnerName?: string;
}

export type TokenKey = keyof Omit<WhiteLabelTokens, "partnerName">;

export const TOKEN_KEYS: readonly TokenKey[] = [
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "accent",
  "accentForeground",
  "background",
  "foreground",
  "card",
  "cardForeground",
  "destructive",
  "destructiveForeground",
  "muted",
  "mutedForeground",
  "border",
  "input",
  "ring",
] as const;

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Accepts CSS color strings: hex (#rgb / #rrggbb / #rrggbbaa),
 * hsl(…), hsla(…), rgb(…), rgba(…), and named colors.
 */
const CSS_COLOR_RE =
  /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8}))$|^(rgb|rgba|hsl|hsla)\(.+\)$|^[a-z]+$/i;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTokens(tokens: unknown): ValidationResult {
  const errors: string[] = [];

  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    return { valid: false, errors: ["tokens must be a plain object"] };
  }

  const t = tokens as Record<string, unknown>;

  for (const key of TOKEN_KEYS) {
    const value = t[key];
    if (value === undefined || value === null) {
      errors.push(`Missing required token: ${key}`);
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`Token "${key}" must be a string, got ${typeof value}`);
      continue;
    }
    if (!CSS_COLOR_RE.test(value.trim())) {
      errors.push(`Token "${key}" has an unrecognised color format: "${value}"`);
    }
  }

  if (
    t.partnerName !== undefined &&
    (typeof t.partnerName !== "string" || !t.partnerName.trim())
  ) {
    errors.push("partnerName must be a non-empty string when provided");
  }

  return { valid: errors.length === 0, errors };
}

// ─── CSS generation ──────────────────────────────────────────────────────────

/** Converts a camelCase token key to the matching CSS custom-property name. */
export function tokenToCssVar(key: TokenKey): string {
  return `--${key.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)}`;
}

/**
 * Generates a scoped CSS block that overrides the Fluid design-system tokens
 * for the given selector (default: `[data-partner]`).
 */
export function generateCss(
  tokens: WhiteLabelTokens,
  selector = "[data-partner]",
): string {
  const partner = tokens.partnerName ? ` — ${tokens.partnerName}` : "";
  const lines: string[] = [
    `/* White-label tokens${partner} */`,
    `${selector} {`,
  ];
  for (const key of TOKEN_KEYS) {
    lines.push(`  ${tokenToCssVar(key)}: ${(tokens as Record<string, string>)[key]};`);
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Applies white-label CSS tokens to a DOM element by injecting or updating
 * a `<style>` tag scoped to `[data-partner="${id}"]`.
 *
 * Safe to call server-side (no-op when `document` is undefined).
 */
export function applyTokensToElement(
  element: HTMLElement,
  tokens: WhiteLabelTokens,
  partnerId: string,
): void {
  if (typeof document === "undefined") return;

  const { valid, errors } = validateTokens(tokens);
  if (!valid) {
    throw new Error(`Invalid white-label tokens:\n${errors.join("\n")}`);
  }

  element.dataset.partner = partnerId;

  const styleId = `fluid-wl-${partnerId}`;
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = generateCss(tokens, `[data-partner="${partnerId}"]`);
}

/**
 * Removes a white-label style injection previously created by `applyTokensToElement`.
 */
export function removeTokensFromElement(
  element: HTMLElement,
  partnerId: string,
): void {
  if (typeof document === "undefined") return;
  delete element.dataset.partner;
  document.getElementById(`fluid-wl-${partnerId}`)?.remove();
}

// ─── Default (Fluid brand) tokens ────────────────────────────────────────────

export const DEFAULT_TOKENS: WhiteLabelTokens = {
  primary: "hsl(220 91% 54%)",
  primaryForeground: "hsl(0 0% 98%)",
  secondary: "hsl(220 14% 96%)",
  secondaryForeground: "hsl(220 9% 13%)",
  accent: "hsl(186 94% 41%)",
  accentForeground: "hsl(0 0% 98%)",
  background: "hsl(0 0% 100%)",
  foreground: "hsl(224 71% 4%)",
  card: "hsl(0 0% 100%)",
  cardForeground: "hsl(224 71% 4%)",
  destructive: "hsl(0 84% 60%)",
  destructiveForeground: "hsl(0 0% 98%)",
  muted: "hsl(220 14% 96%)",
  mutedForeground: "hsl(220 9% 46%)",
  border: "hsl(220 13% 91%)",
  input: "hsl(220 13% 91%)",
  ring: "hsl(220 91% 54%)",
  partnerName: "Fluid (default)",
};
