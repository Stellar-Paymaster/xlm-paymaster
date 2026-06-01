/**
 * Fluid Admin Dashboard — Design System Tokens
 *
 * This file documents the brand token values used throughout the Fluid design
 * system.  In Tailwind CSS v4 the runtime theme is configured via CSS
 * (@theme inline) in app/globals.css, but the authoritative palette lives here
 * so TypeScript code can import individual tokens (e.g. for charting libraries
 * or inline styles) without duplicating magic strings.
 *
 * To add a new token:
 *   1. Export it below.
 *   2. Mirror it as a CSS variable in app/globals.css.
 */

import type { Config } from "tailwindcss";

// ─── Fluid Brand Palette ─────────────────────────────────────────────────────

export const fluidColors = {
  // Primary — Fluid Blue
  primary: "hsl(220 91% 54%)",            // #2563EB
  primaryForeground: "hsl(0 0% 98%)",

  // Accent — Fluid Cyan (water / flow)
  accent: "hsl(186 94% 41%)",             // #06B6D4
  accentForeground: "hsl(0 0% 98%)",

  // Neutrals
  background: "hsl(0 0% 100%)",
  foreground: "hsl(224 71% 4%)",
  card: "hsl(0 0% 100%)",
  cardForeground: "hsl(224 71% 4%)",
  popover: "hsl(0 0% 100%)",
  popoverForeground: "hsl(224 71% 4%)",
  secondary: "hsl(220 14% 96%)",
  secondaryForeground: "hsl(220 9% 13%)",
  muted: "hsl(220 14% 96%)",
  mutedForeground: "hsl(220 9% 46%)",
  border: "hsl(220 13% 91%)",
  input: "hsl(220 13% 91%)",
  ring: "hsl(220 91% 54%)",

  // Semantic
  destructive: "hsl(0 84% 60%)",
  destructiveForeground: "hsl(0 0% 98%)",
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────

export const fluidRadius = {
  base: "0.5rem",  // --radius in globals.css
  sm: "0.3rem",
  md: "0.5rem",
  lg: "0.7rem",
  xl: "0.9rem",
} as const;

// ─── Tailwind Config (plugins / content only — theme lives in CSS for v4) ────

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
};

export default config;
