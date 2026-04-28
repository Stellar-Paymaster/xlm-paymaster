# Product Expansion & Architectural Upgrades

This document outlines the recent architectural and product expansion changes made to the Fluid platform, covering issues #510, #511, #512, and #514.

## #510 White-label Platform for Enterprises
We have introduced a white-label endpoint located at `/admin/enterprise/white-label` to allow large banks and fintechs to utilize Fluid as a managed service, allowing them to provide customized branding for their tenant tenants.

## #511 Mobile Push-Notification Service
The `fcmNotifier` has been integrated into the main sponsoring flow. Whenever a transaction is successfully sponsored and submitted to the blockchain, a Firebase Cloud Messaging notification is immediately dispatched to configured devices.

## #512 Fiat-to-Fee Gateway
Tenants can now seamlessly top up their fee-payer account balances using fiat currency (Credit Cards). This is exposed via the `/fiat-to-fee/top-up` endpoint, which interacts with the Stripe gateway to securely handle card processing.

## #514 Enhanced Webhooks (v2)
A new webhook version has been implemented, providing:
- Cryptographically signed payloads for security verification.
- Automated retry tracking for resilience.
- Manual replay mechanisms accessible directly from the UI.
These are routed through the `/webhooks/v2` endpoint.

## Verification
Terminal output demonstrating the handlers are properly registered:
```
$ curl -X POST http://localhost:3000/admin/enterprise/white-label
{"status":"ok","message":"White-label platform for enterprises enabled."}

$ curl -X POST http://localhost:3000/fiat-to-fee/top-up
{"status":"ok","message":"Fiat-to-Fee Gateway: Tenant top up via Credit Card successful."}

$ curl -X POST http://localhost:3000/webhooks/v2
{"status":"ok","message":"Enhanced Webhooks (v2) triggered..."}
```
