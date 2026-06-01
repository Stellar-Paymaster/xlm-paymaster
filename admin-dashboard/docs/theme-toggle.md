# Theme Toggle

A compact single-click button that toggles between **light** and **dark** mode. Complements the full `ThemeSwitcher` popover already present in the Navbar.

## Component

`components/theme/ThemeToggle.tsx`

```tsx
import { ThemeToggle } from "@/components/theme/ThemeToggle";

<ThemeToggle />
```

## Behaviour

| Current resolved theme | Icon shown | Click result |
|------------------------|------------|--------------|
| `light`                | Moon       | Sets theme to `dark` |
| `dark`                 | Sun        | Sets theme to `light` |
| `high-contrast`        | Moon       | Sets theme to `dark` |

The toggle reads `resolvedTheme` from `next-themes` (via `useTheme`) and calls `setTheme` on click. It renders an empty placeholder before hydration to avoid a flash of mismatched content.

## Integration

The toggle uses the same `next-themes` `ThemeProvider` already configured in `components/providers.tsx`. The provider stores the preference under `THEME_STORAGE_KEY` (`"fluid-admin-theme"`) in `localStorage` so the selection persists across page loads.

## Accessibility

- `aria-label` is updated dynamically to reflect the action the button will perform.
- Icons carry `aria-hidden="true"` so screen readers only announce the button label.

## Tests

```
npx vitest run components/theme/ThemeToggle.test.tsx
```
