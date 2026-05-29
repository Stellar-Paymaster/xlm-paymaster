# Integrated Stripe Billing UI

The Fluid Admin Dashboard now includes a professional-grade billing and quota management interface, allowing tenants to monitor their XLM sponsorship balance and purchase top-ups seamlessly via Stripe.

## Features

- **Real-time Balance Monitoring**: View current XLM sponsorship balance and quota utilization directly on the dashboard.
- **Quota Top-ups**: Secure credit card payments via Stripe Checkout for instant replenishment of XLM sponsorship funds.
- **Payment History**: Comprehensive log of all billing transactions with invoice download support.
- **Card Management**: View and update primary payment methods securely.
- **Auto Top-up**: Configuration for automated replenishment to ensure uninterrupted service.

## Technical Implementation

### Frontend

- **Route**: `/admin/billing`
- **Components**:
  - `BillingTopUp`: A high-fidelity payment component using Framer Motion for animations and Stripe Checkout for secure payments.
  - `StatCard`: Enhanced to support contextual actions (e.g., "Top-up" button directly in the balance card).
- **Data Layer**: `lib/billing-data.ts` handles communication with the backend billing services.

### API Integration

The dashboard proxies billing requests to the Fluid backend:
- `POST /api/billing/create-checkout-session`: Initiates a Stripe Checkout session.

## Security & Compliance

- **Stripe Checkout**: All sensitive payment information is handled by Stripe (PCI-DSS compliant).
- **Admin Authorization**: Billing operations require valid admin session and tokens.
- **Audit Logging**: All top-up attempts and successful payments are logged in the system audit logs.

## Testing

- **Unit Tests**: Components are tested using Vitest and React Testing Library.
- **E2E Tests**: Playwright scripts cover the full top-up flow from dashboard to checkout redirect.
- **Visual Regression**: Chromatic is used to ensure UI consistency across different browsers.
