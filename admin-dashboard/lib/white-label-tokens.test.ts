import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateTokens,
  generateCss,
  tokenToCssVar,
  applyTokensToElement,
  removeTokensFromElement,
  DEFAULT_TOKENS,
  TOKEN_KEYS,
  type WhiteLabelTokens,
} from "./white-label-tokens";

const validTokens: WhiteLabelTokens = { ...DEFAULT_TOKENS };

// ─── validateTokens ───────────────────────────────────────────────────────────

describe("validateTokens", () => {
  it("accepts the default Fluid token set", () => {
    const result = validateTokens(validTokens);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts hex color values", () => {
    const t = { ...validTokens, primary: "#2563EB" };
    expect(validateTokens(t).valid).toBe(true);
  });

  it("accepts shorthand hex (#rgb)", () => {
    const t = { ...validTokens, accent: "#06f" };
    expect(validateTokens(t).valid).toBe(true);
  });

  it("accepts rgb() values", () => {
    const t = { ...validTokens, background: "rgb(255, 255, 255)" };
    expect(validateTokens(t).valid).toBe(true);
  });

  it("accepts rgba() values", () => {
    const t = { ...validTokens, card: "rgba(0,0,0,0.5)" };
    expect(validateTokens(t).valid).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(validateTokens(null).valid).toBe(false);
    expect(validateTokens("blue").valid).toBe(false);
    expect(validateTokens([]).valid).toBe(false);
  });

  it("reports all missing required tokens", () => {
    const result = validateTokens({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("primary"))).toBe(true);
  });

  it("rejects an invalid color format", () => {
    const t = { ...validTokens, primary: "not-a-color-123" };
    const result = validateTokens(t);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/primary/);
  });

  it("rejects non-string token values", () => {
    const t = { ...validTokens, border: 42 as unknown as string };
    const result = validateTokens(t);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/border.*string/);
  });

  it("rejects empty partnerName when present", () => {
    const t = { ...validTokens, partnerName: "" };
    const result = validateTokens(t);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/partnerName/);
  });

  it("accepts a valid partnerName", () => {
    const t = { ...validTokens, partnerName: "Acme Corp" };
    expect(validateTokens(t).valid).toBe(true);
  });
});

// ─── tokenToCssVar ────────────────────────────────────────────────────────────

describe("tokenToCssVar", () => {
  it("converts camelCase keys to CSS custom properties", () => {
    expect(tokenToCssVar("primary")).toBe("--primary");
    expect(tokenToCssVar("primaryForeground")).toBe("--primary-foreground");
    expect(tokenToCssVar("cardForeground")).toBe("--card-foreground");
    expect(tokenToCssVar("mutedForeground")).toBe("--muted-foreground");
    expect(tokenToCssVar("destructiveForeground")).toBe("--destructive-foreground");
  });

  it("covers every token key", () => {
    for (const key of TOKEN_KEYS) {
      expect(tokenToCssVar(key)).toMatch(/^--[a-z-]+$/);
    }
  });
});

// ─── generateCss ─────────────────────────────────────────────────────────────

describe("generateCss", () => {
  it("produces a valid CSS block with default selector", () => {
    const css = generateCss(validTokens);
    expect(css).toContain("[data-partner]");
    expect(css).toContain("--primary:");
    expect(css).toContain("--primary-foreground:");
    expect(css).toContain("--background:");
  });

  it("includes all token keys", () => {
    const css = generateCss(validTokens);
    for (const key of TOKEN_KEYS) {
      expect(css).toContain(tokenToCssVar(key));
    }
  });

  it("uses a custom selector when provided", () => {
    const css = generateCss(validTokens, ".my-partner");
    expect(css).toContain(".my-partner {");
    expect(css).not.toContain("[data-partner]");
  });

  it("includes partnerName in a comment when set", () => {
    const t = { ...validTokens, partnerName: "Acme Corp" };
    expect(generateCss(t)).toContain("Acme Corp");
  });
});

// ─── applyTokensToElement / removeTokensFromElement ──────────────────────────

describe("applyTokensToElement", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.getElementById("fluid-wl-test-partner")?.remove();
  });

  it("sets data-partner attribute on the element", () => {
    applyTokensToElement(container, validTokens, "test-partner");
    expect(container.dataset.partner).toBe("test-partner");
  });

  it("injects a <style> tag into <head>", () => {
    applyTokensToElement(container, validTokens, "test-partner");
    const styleEl = document.getElementById("fluid-wl-test-partner");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain("--primary:");
  });

  it("updates an existing <style> tag on re-apply", () => {
    applyTokensToElement(container, validTokens, "test-partner");
    const updatedTokens = { ...validTokens, primary: "#ff0000" };
    applyTokensToElement(container, updatedTokens, "test-partner");

    const styleTags = document.querySelectorAll("#fluid-wl-test-partner");
    expect(styleTags.length).toBe(1);
    expect(styleTags[0].textContent).toContain("#ff0000");
  });

  it("throws for invalid tokens", () => {
    const bad = { ...validTokens, primary: "INVALID!" };
    expect(() => applyTokensToElement(container, bad, "test-partner")).toThrow(
      "Invalid white-label tokens",
    );
  });
});

describe("removeTokensFromElement", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    applyTokensToElement(container, validTokens, "rm-partner");
  });

  afterEach(() => {
    container.remove();
    document.getElementById("fluid-wl-rm-partner")?.remove();
  });

  it("removes the data-partner attribute", () => {
    removeTokensFromElement(container, "rm-partner");
    expect(container.dataset.partner).toBeUndefined();
  });

  it("removes the injected style tag", () => {
    removeTokensFromElement(container, "rm-partner");
    expect(document.getElementById("fluid-wl-rm-partner")).toBeNull();
  });
});

// ─── Integration: full round-trip ────────────────────────────────────────────

describe("white-label token round-trip", () => {
  it("validates, generates CSS, and applies to DOM without errors", () => {
    const tokens: WhiteLabelTokens = {
      ...validTokens,
      primary: "#7c3aed",
      accent: "#f59e0b",
      partnerName: "Purple Co",
    };

    const { valid } = validateTokens(tokens);
    expect(valid).toBe(true);

    const css = generateCss(tokens, '[data-partner="purple-co"]');
    expect(css).toContain("#7c3aed");
    expect(css).toContain("#f59e0b");
    expect(css).toContain("Purple Co");

    const el = document.createElement("div");
    document.body.appendChild(el);
    applyTokensToElement(el, tokens, "purple-co");
    expect(el.dataset.partner).toBe("purple-co");
    removeTokensFromElement(el, "purple-co");
    el.remove();
  });
});
