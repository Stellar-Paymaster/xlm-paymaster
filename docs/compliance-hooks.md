# Compliance Hooks Architecture

## Overview

The compliance hooks system provides a plugin-based architecture for region-specific validation. Each region can have one or more validation hooks that are registered and executed against form submission data.

## Architecture

```
src/compliance/
├── types.ts              # Core interfaces (ComplianceHook, ValidationResult)
├── ComplianceRegistry.ts # Registry for managing hooks
├── index.ts              # Public exports and runComplianceHooks utility
├── hooks/
│   └── brazilian-cpf-hook.ts  # Brazil CPF validation plugin
└── __tests__/           # Unit and integration tests
```

## How to Add a New Region Plugin

1. Create a new hook class in `src/compliance/hooks/` implementing `ComplianceHook`:

```typescript
import type { ComplianceHook, ValidationResult } from "../types";

export class MyRegionHook implements ComplianceHook {
  readonly region = "MY";
  readonly errorMessage = "Invalid regional data";

  validate(data: unknown): ValidationResult {
    // Your validation logic
    return { region: this.region, valid: true, errorMessage: null };
  }
}
```

2. Register the hook in your application:

```typescript
import { getComplianceRegistry } from "@/compliance";
import { MyRegionHook } from "@/compliance/hooks/my-region-hook";

const registry = getComplianceRegistry();
registry.register(new MyRegionHook());
```

## CPF Validation Logic

The Brazilian CPF validation follows these rules:

1. **Format**: Must be exactly 11 digits after stripping formatting
2. **Formatting characters**: Stripped automatically (e.g., `529.982.247-25` → `52998224725`)
3. **Same-digit check**: All digits identical (e.g., `11111111111`) is invalid
4. **Checksum**: Uses modulo 11 algorithm for both check digits

### Checksum Algorithm

For a CPF `XXXXXXXXXX-D`:
- First check digit: Sum of (digit[i] × (10-i)) for i=0..8, mod 11
- Second check digit: Sum of (digit[i] × (11-i)) for i=0..9, mod 11

## API Reference

### `runComplianceHooks(region: string, data: unknown): ValidationResult[]`

Executes all registered hooks for a region. Returns empty array for unknown regions.

### `ComplianceRegistry`

- `register(hook: ComplianceHook): void` - Register a hook
- `unregister(region: string): void` - Remove all hooks for a region
- `getHooks(region: string): ComplianceHook[]` - Get hooks for a region
- `execute(region: string, data: unknown): Promise<ValidationResult[]>` - Execute hooks

## Error Handling

- Null/undefined input returns `valid: false`
- Unknown region codes return empty results (not errors)
- Non-string input is coerced where appropriate