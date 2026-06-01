"use client";

import { useState, useCallback, useRef } from "react";
import {
  validateTokens,
  applyTokensToElement,
  removeTokensFromElement,
  generateCss,
  DEFAULT_TOKENS,
  TOKEN_KEYS,
  tokenToCssVar,
  type WhiteLabelTokens,
  type TokenKey,
} from "@/lib/white-label-tokens";

const TOKEN_LABELS: Record<TokenKey, string> = {
  primary: "Primary",
  primaryForeground: "Primary Foreground",
  secondary: "Secondary",
  secondaryForeground: "Secondary Foreground",
  accent: "Accent",
  accentForeground: "Accent Foreground",
  background: "Background",
  foreground: "Foreground",
  card: "Card",
  cardForeground: "Card Foreground",
  destructive: "Destructive",
  destructiveForeground: "Destructive Foreground",
  muted: "Muted",
  mutedForeground: "Muted Foreground",
  border: "Border",
  input: "Input",
  ring: "Focus Ring",
};

function isHexColor(v: string) {
  return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
}

export function WhiteLabelTokensManager() {
  const previewRef = useRef<HTMLDivElement>(null);
  const [partnerId, setPartnerId] = useState("my-partner");
  const [partnerName, setPartnerName] = useState("Acme Corp");
  const [tokens, setTokens] = useState<WhiteLabelTokens>({ ...DEFAULT_TOKENS });
  const [errors, setErrors] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  const [generatedCss, setGeneratedCss] = useState("");
  const [copied, setCopied] = useState(false);

  const handleTokenChange = useCallback(
    (key: TokenKey, value: string) => {
      setTokens((prev) => ({ ...prev, [key]: value }));
      setErrors([]);
      setApplied(false);
    },
    [],
  );

  const handleApply = useCallback(() => {
    const t: WhiteLabelTokens = { ...tokens, partnerName };
    const { valid, errors: errs } = validateTokens(t);
    if (!valid) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    if (previewRef.current) {
      applyTokensToElement(previewRef.current, t, partnerId);
    }
    setGeneratedCss(generateCss(t, `[data-partner="${partnerId}"]`));
    setApplied(true);
  }, [tokens, partnerName, partnerId]);

  const handleReset = useCallback(() => {
    if (previewRef.current) removeTokensFromElement(previewRef.current, partnerId);
    setTokens({ ...DEFAULT_TOKENS });
    setErrors([]);
    setApplied(false);
    setGeneratedCss("");
  }, [partnerId]);

  const handleCopyCss = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedCss);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [generatedCss]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">White-label Color Tokens</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize the dashboard color palette for enterprise partners. Changes
          are previewed live and the generated CSS block can be injected into any
          deployment.
        </p>
      </div>

      {/* Partner metadata */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="wl-partner-id"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
          >
            Partner ID
          </label>
          <input
            id="wl-partner-id"
            type="text"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value.replace(/\s+/g, "-").toLowerCase())}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="wl-partner-name"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
          >
            Partner Name
          </label>
          <input
            id="wl-partner-name"
            type="text"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Token editor */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOKEN_KEYS.map((key) => {
          const value = (tokens as Record<string, string>)[key] ?? "";
          const hex = isHexColor(value);
          return (
            <div key={key} className="flex flex-col gap-1">
              <label
                htmlFor={`wl-${key}`}
                className="text-xs font-semibold text-muted-foreground"
              >
                {TOKEN_LABELS[key]}
                <span className="ml-1 font-mono text-[10px] opacity-60">
                  {tokenToCssVar(key)}
                </span>
              </label>
              <div className="flex items-center gap-2">
                {hex && (
                  <input
                    type="color"
                    value={value}
                    aria-label={`Color picker for ${TOKEN_LABELS[key]}`}
                    onChange={(e) => handleTokenChange(key, e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                )}
                <input
                  id={`wl-${key}`}
                  type="text"
                  value={value}
                  onChange={(e) => handleTokenChange(key, e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Error messages */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-semibold mb-1">Fix the following before applying:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleApply}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          Apply tokens
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary"
        >
          Reset to defaults
        </button>
      </div>

      {/* Live preview */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live Preview
        </p>
        <div
          ref={previewRef}
          data-testid="wl-preview"
          className="rounded-xl border border-border p-6 bg-background"
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-md px-4 py-2 text-sm font-semibold"
              style={{
                background: (tokens as Record<string, string>).primary,
                color: (tokens as Record<string, string>).primaryForeground,
              }}
            >
              Primary button
            </button>
            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm font-semibold"
              style={{
                background: (tokens as Record<string, string>).secondary,
                color: (tokens as Record<string, string>).secondaryForeground,
                borderColor: (tokens as Record<string, string>).border,
              }}
            >
              Secondary button
            </button>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: (tokens as Record<string, string>).accent,
                color: (tokens as Record<string, string>).accentForeground,
              }}
            >
              Accent badge
            </span>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: (tokens as Record<string, string>).destructive,
                color: (tokens as Record<string, string>).destructiveForeground,
              }}
            >
              Destructive
            </span>
          </div>
          <div
            className="mt-4 rounded-lg border p-4"
            style={{
              background: (tokens as Record<string, string>).card,
              color: (tokens as Record<string, string>).cardForeground,
              borderColor: (tokens as Record<string, string>).border,
            }}
          >
            <p className="text-sm font-semibold">Card surface</p>
            <p
              className="mt-1 text-xs"
              style={{ color: (tokens as Record<string, string>).mutedForeground }}
            >
              Muted foreground text on card background.
            </p>
          </div>
        </div>
      </div>

      {/* Generated CSS */}
      {applied && generatedCss && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Generated CSS
            </p>
            <button
              type="button"
              onClick={handleCopyCss}
              className="rounded-md border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-secondary"
            >
              {copied ? "Copied!" : "Copy CSS"}
            </button>
          </div>
          <pre
            data-testid="wl-generated-css"
            className="overflow-x-auto rounded-xl border border-border bg-zinc-950 p-4 text-xs text-zinc-200"
            tabIndex={0}
          >
            {generatedCss}
          </pre>
        </div>
      )}
    </div>
  );
}
