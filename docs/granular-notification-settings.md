# Granular Notification Settings

The Fluid admin dashboard includes a comprehensive interface allowing administrators to manage notification and alert configurations on a highly granular, per-tenant basis.

## Features

- **Per-Tenant Configuration**: Settings are scoped to individual tenants, meaning critical high-volume tenants can route alerts differently than development or low-volume tenants.
- **Multi-Channel Support**: Independent toggles for Email and Slack routing.
- **Selective Routing**: You can configure a tenant to trigger Slack webhooks while explicitly disabling Email alerts to reduce inbox noise.

## Architecture

The settings are managed by the `useNotificationSettings` hook (`admin-dashboard/src/hooks/useNotificationSettings.ts`), which provides optimistic UI updates for instant feedback while preserving the source of truth payload until the user clicks `Save Configuration`.

### Configurable Channels

Currently, the following two channels are supported out-of-the-box:
1. **Email Alerts**: Requires a valid target email address.
2. **Slack Alerts**: Requires a standard Slack Incoming Webhook URL (`https://hooks.slack.com/services/...`).

## Usage

To mount the configuration interface in a dashboard view, supply it with the tenant data payload:

```tsx
import { NotificationSettings } from "@/components/NotificationSettings";
<NotificationSettings initialData={serverTenantSettings} />
```