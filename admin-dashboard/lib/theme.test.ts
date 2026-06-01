import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RESOLVED_THEME,
  DEFAULT_THEME_PREFERENCE,
  THEME_OPTIONS,
  describeThemePreference,
  resolveThemePreference,
  sanitizeResolvedTheme,
  sanitizeThemePreference,
} from "./theme.ts";

test("sanitizeThemePreference falls back to system for unsupported values", () => {
  assert.equal(sanitizeThemePreference("sepia"), DEFAULT_THEME_PREFERENCE);
  assert.equal(sanitizeThemePreference(undefined), DEFAULT_THEME_PREFERENCE);
  assert.equal(sanitizeThemePreference("high-contrast"), "high-contrast");
});

test("sanitizeResolvedTheme falls back to light for unresolved values", () => {
  assert.equal(sanitizeResolvedTheme("system"), DEFAULT_RESOLVED_THEME);
  assert.equal(sanitizeResolvedTheme(undefined), DEFAULT_RESOLVED_THEME);
  assert.equal(sanitizeResolvedTheme("dark"), "dark");
});

test("resolveThemePreference honors system preference and explicit overrides", () => {
  assert.equal(resolveThemePreference("system", false), "light");
  assert.equal(resolveThemePreference("system", true), "dark");
  assert.equal(resolveThemePreference("dark", false), "dark");
  assert.equal(resolveThemePreference("high-contrast", true), "high-contrast");
});

test("describeThemePreference exposes current system resolution for the UI", () => {
  assert.equal(describeThemePreference("system", "dark"), "System (Dark)");
  assert.equal(describeThemePreference("light", "dark"), "Light");
});

test("theme options include every selectable appearance mode", () => {
  assert.deepEqual(
    THEME_OPTIONS.map((option) => option.value),
    ["system", "light", "dark", "high-contrast"],
  );
});
