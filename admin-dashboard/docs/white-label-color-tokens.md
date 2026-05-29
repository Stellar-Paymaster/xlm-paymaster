# White-label Color Tokens

Fluid supports per-partner theme customisation through a CSS custom-property
token system. Enterprise partners can supply a set of color values that replace
the default Fluid brand palette across every component in the admin dashboard.

## How it works

1. **Token schema** — `lib/white-label-tokens.ts` exports `WhiteLabelTokens`, a
   typed interface covering all 17 semantic color roles used by the Tailwind
   design system (primary, accent, background, card, destructive, etc.).

2. **Validation** — `validateTokens(tokens)` accepts any CSS color format: hex
   (`#2563EB`), shorthand hex (`#06f`), `hsl(...)`, `rgba(...)`, or named CSS
   colors. It returns `{ valid, errors }` so callers can surface actionable
   messages before applying styles.

3. **CSS generation** — `generateCss(tokens, selector?)` produces a scoped CSS
   block that overrides every `--token-name` custom property under a given
   selector (default: `[data-partner]`).  The output is ready to paste into a
   global stylesheet or inject via a `<style>` tag.

4. **DOM injection** — `applyTokensToElement(el, tokens, partnerId)` validates,
   generates, and injects the CSS into `<head>`, then sets
   `data-partner="<partnerId>"` on the target element.  Call
   `removeTokensFromElement(el, partnerId)` to undo it cleanly.

5. **UI component** — `components/dashboard/WhiteLabelTokensManager.tsx` is a
   React form that lets admins edit all token values, preview changes live, and
   copy the generated CSS block.

## Token reference

| Token key              | CSS variable             | Role                                |
|------------------------|--------------------------|-------------------------------------|
| `primary`              | `--primary`              | Primary action color                |
| `primaryForeground`    | `--primary-foreground`   | Text on primary surfaces            |
| `secondary`            | `--secondary`            | Secondary / neutral surface         |
| `secondaryForeground`  | `--secondary-foreground` | Text on secondary surfaces          |
| `accent`               | `--accent`               | Accent highlights                   |
| `accentForeground`     | `--accent-foreground`    | Text on accent surfaces             |
| `background`           | `--background`           | Page background                     |
| `foreground`           | `--foreground`           | Default body text                   |
| `card`                 | `--card`                 | Card surface                        |
| `cardForeground`       | `--card-foreground`      | Text on card surfaces               |
| `destructive`          | `--destructive`          | Error / danger color                |
| `destructiveForeground`| `--destructive-foreground`| Text on destructive surfaces       |
| `muted`                | `--muted`                | Subtle background                   |
| `mutedForeground`      | `--muted-foreground`     | Secondary / caption text            |
| `border`               | `--border`               | Border color                        |
| `input`                | `--input`                | Input border color                  |
| `ring`                 | `--ring`                 | Focus ring color                    |

## Usage example

```typescript
import {
  applyTokensToElement,
  removeTokensFromElement,
  type WhiteLabelTokens,
} from "@/lib/white-label-tokens";

const acmeTokens: WhiteLabelTokens = {
  primary: "#7c3aed",
  primaryForeground: "#ffffff",
  accent: "#f59e0b",
  accentForeground: "#ffffff",
  // ... remaining tokens
  partnerName: "Acme Corp",
};

// Apply to a container element
const container = document.getElementById("dashboard-root")!;
applyTokensToElement(container, acmeTokens, "acme");

// Remove when the partner session ends
removeTokensFromElement(container, "acme");
```

## Validation

```typescript
import { validateTokens } from "@/lib/white-label-tokens";

const { valid, errors } = validateTokens(acmeTokens);
if (!valid) {
  console.error("Invalid tokens:", errors);
}
```

## Security considerations

- Token values are validated against a CSS color regex before injection.
  Strings that do not match `#hex`, `rgb(...)`, `hsl(...)`, or a simple named
  color are rejected, preventing CSS injection.
- `applyTokensToElement` always runs validation before touching the DOM.
- Token storage (per-partner configuration persistence) is outside the scope of
  this module and should use the existing Fluid admin API with appropriate RBAC.
