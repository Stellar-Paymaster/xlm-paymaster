import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RESOLVED_THEMES, THEME_OPTIONS } from "./theme.ts";

const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const providersSource = readFileSync(
  new URL("../components/providers.tsx", import.meta.url),
  "utf8",
);
const navbarSource = readFileSync(
  new URL("../components/Navbar.tsx", import.meta.url),
  "utf8",
);

test("globals.css defines a token palette for each resolved theme", () => {
  for (const theme of RESOLVED_THEMES) {
    assert.match(globalsCss, new RegExp(`\\[data-theme="${theme}"\\]`));
  }
});

test("providers wire next-themes with persisted system-aware configuration", () => {
  assert.match(providersSource, /attribute="data-theme"/);
  assert.match(providersSource, /defaultTheme="system"/);
  assert.match(providersSource, /enableSystem/);
  assert.match(providersSource, /storageKey=\{THEME_STORAGE_KEY\}/);
});

test("navbar exposes the shared theme switcher control", () => {
  assert.match(navbarSource, /ThemeSwitcher/);
  assert.match(navbarSource, /<ThemeSwitcher \/>/);
});

test("theme options stay aligned with the documented accessibility choices", () => {
  const labels = THEME_OPTIONS.map((option) => option.label);

  assert.ok(labels.includes("Dark"));
  assert.ok(labels.includes("High contrast"));
  assert.ok(labels.includes("System"));
});
