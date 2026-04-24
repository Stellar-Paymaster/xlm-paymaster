# Dark Mode Restoration and High-Contrast Mode

## Overview

The admin dashboard now supports four appearance modes:

- `System`: follows the operating system light or dark preference.
- `Light`: keeps the existing bright dashboard palette.
- `Dark`: restores a low-glare dark UI for prolonged operational use.
- `High contrast`: maximizes separation between surfaces, text, and focus indicators for accessible environments.

## Implementation Notes

- Theme persistence is handled through `next-themes` with the `fluid-admin-theme` storage key.
- Shared theme tokens live in `lib/theme.ts`.
- Runtime CSS palettes live in `app/globals.css` and are applied through the `data-theme` attribute.
- The shared navbar hosts the appearance control through `components/theme/ThemeSwitcher.tsx`.
- A compatibility layer in `app/globals.css` remaps legacy light-only utility classes so existing admin views remain readable in dark and high-contrast modes.

## Accessibility and Design Standards

- `:focus-visible` always receives a visible outline using the active ring token.
- `@media (forced-colors: active)` preserves operating-system high-contrast behavior.
- High-contrast mode uses black backgrounds, white text, and bright action accents for strong perceptual separation.
- The appearance selector uses radio semantics and clear labels for screen-reader compatibility.

## Test Coverage

- `lib/theme.test.ts` validates theme sanitization, system resolution, and labeling logic.
- `lib/theme.integration.test.ts` validates provider wiring, navbar integration, and CSS palette coverage.
- `lib/portal-links.test.ts` remains covered under the same package-local Node test runner.
