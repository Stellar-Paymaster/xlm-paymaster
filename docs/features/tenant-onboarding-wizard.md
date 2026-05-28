# Tenant Onboarding Wizard

## Overview

Implements a step-by-step guide for new developers to get their first API key. The wizard provides a professional, accessible experience with progress tracking and comprehensive validation.

## Architecture

### Components

1. **Core Logic** (`lib/tenantOnboardingWizard.ts`, `src/tenantOnboardingWizard.ts`)
   - Immutable state management
   - Step-based progression model
   - Comprehensive validation with Zod
   - TypeScript types for type safety

2. **React Component** (`components/TenantOnboardingWizard.tsx`)
   - Interactive UI with form fields
   - Real-time validation
   - Progress tracking with visual indicator
   - API integration for API key generation

3. **API Routes**
   - `/api/wizard/start` - Initialize wizard state
   - `/api/wizard/generate-key` - Generate API key
   - `/api/wizard/validate-tenant` - Server-side tenant data validation
   - `/api/wizard/poll` - Polling endpoint for fee-bump detection

4. **Pages**
   - `/onboarding` - Main onboarding page

## Wizard Steps

1. **Welcome**: Introduction and feature overview
2. **Tenant Info**: Collect organization details
   - Tenant name (3-100 characters)
   - Email address (valid email format)
   - Description (optional, max 500 characters)
   - Webhook URL (optional, valid URL)
3. **API Key Generation**: Generate secure API key
4. **API Key Verification**: Display generated key and tenant details
5. **Completion**: Success confirmation with next steps

## State Management

WizardState includes:
- `currentStep`: Current step in the wizard
- `completedSteps`: Array of completed steps
- `tenantData`: Tenant information
- `apiKey`: Generated API key
- `errors`: Validation error messages

## Validation

- **Tenant Name**: Min 3, max 100 characters
- **Email**: Valid email format
- **Description**: Optional, max 500 characters
- **Webhook URL**: Valid HTTPS URL (optional)

## API Key Format

Generated API keys follow format: `sk_admin_<random_string>`

Example: `sk_admin_a7b9c2d4e1f8g3h6`

## Files Created/Modified

- `lib/tenantOnboardingWizard.ts` - Core logic
- `lib/tenantOnboardingWizard.test.ts` - Unit tests
- `src/tenantOnboardingWizard.ts` - Type-safe logic for frontend
- `src/tenantOnboardingWizard.test.ts` - Vitest tests
- `components/TenantOnboardingWizard.tsx` - React component
- `app/onboarding/page.tsx` - Page component
- `app/api/wizard/start/route.ts` - Initialization endpoint
- `app/api/wizard/generate-key/route.ts` - Key generation endpoint
- `app/api/wizard/validate-tenant/route.ts` - Validation endpoint
- `app/api/wizard/poll/route.ts` - Already existing

## Test Coverage

25 test cases covering:
- State initialization and transitions
- Step navigation (forward/backward)
- Data validation (all fields)
- API key generation
- Wizard completion logic
- Error handling
- Edge cases

All tests use Node.js built-in test runner for lib/ directory.

## Usage

### Accessing the Wizard

Navigate to `/onboarding` to start the wizard.

### Programmatic Usage

```typescript
import { initializeWizard, advanceStep, updateTenantData } from '@/src/tenantOnboardingWizard';

let state = initializeWizard();
state = updateTenantData(state, {
  tenantName: 'My Company',
  tenantEmail: 'contact@company.com'
});
state = advanceStep(state);
```

## Future Enhancements

- Database persistence of created tenants
- Email confirmation step
- API key rotation policies
- Rate limit configuration
- Webhook delivery testing
