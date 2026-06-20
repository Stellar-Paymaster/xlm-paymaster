# Requirements Document

## Introduction

The Affiliate Referral Program allows existing XLM Paymaster tenants to invite new developers to the platform. Each tenant receives a unique referral link. When a referred developer signs up, verifies their email, and completes their first successful fee-sponsorship bump, the referring tenant earns a 1 000-stroop XLM quota bonus. Tenants can view their referral history and bonus credits from a dedicated page in the developer portal.

This feature is part of Phase 9: Developer Portal and is implemented entirely within the Next.js 15 admin-dashboard, following the existing in-memory data-store pattern (no Prisma in the dashboard). The dashboard proxies quota-credit operations to the backend via `PAYMASTER_SERVER_URL`.

---

## Glossary

- **Referral_Code**: A unique, URL-safe alphanumeric token assigned to each tenant and embedded in their referral link.
- **Referral_Link**: A public URL of the form `{NEXT_PUBLIC_SITE_URL}/register?ref={Referral_Code}` that a tenant shares with prospective developers.
- **Referrer**: The existing tenant whose Referral_Code was used during sign-up.
- **Referred_User**: A new developer who registered using a Referral_Link.
- **Attribution_Cookie**: An HTTP-only, short-lived cookie (`paymaster_ref`) set when a visitor lands on the registration page with a valid `ref` query parameter.
- **Verified_Email**: The state of a Referred_User's account after they have clicked the confirmation link sent to their email address.
- **First_Bump**: The first successful fee-sponsorship transaction submitted by a Referred_User after their email is verified.
- **Quota_Bonus**: A one-time credit of 1 000 stroops added to the Referrer's XLM quota upon a qualifying First_Bump.
- **Referral_Store**: The in-memory data store (`lib/referral-data.ts`) that persists referral codes, attributions, and bonus history for the lifetime of the server process.
- **Referral_History_Page**: The tenant-facing page at `/referrals` that displays a tenant's Referral_Link, total bonuses earned, and a list of past referral events.
- **Paymaster_Server**: The backend service reachable at `PAYMASTER_SERVER_URL` that owns tenant quota and processes bump transactions.

---

## Requirements

### Requirement 1: Referral Code Generation

**User Story:** As a tenant, I want a unique referral code automatically assigned to my account, so that I can share a personalised link without any manual setup.

#### Acceptance Criteria

1. THE Referral_Store SHALL assign a unique Referral_Code to every tenant the first time their referral data is accessed.
2. THE Referral_Store SHALL generate Referral_Codes using at least 12 URL-safe alphanumeric characters.
3. THE Referral_Store SHALL guarantee that no two tenants share the same Referral_Code.
4. WHEN a Referral_Code is requested for a tenant that already has one, THE Referral_Store SHALL return the existing code unchanged (idempotent).

---

### Requirement 2: Referral Link Exposure

**User Story:** As a tenant, I want to see my unique referral link in the dashboard, so that I can copy and share it with developers I want to invite.

#### Acceptance Criteria

1. THE Referral_History_Page SHALL display the tenant's full Referral_Link constructed as `{NEXT_PUBLIC_SITE_URL}/register?ref={Referral_Code}`.
2. THE Referral_History_Page SHALL provide a one-click copy control that writes the Referral_Link to the clipboard.
3. WHEN `NEXT_PUBLIC_SITE_URL` is not set, THE Referral_History_Page SHALL fall back to a relative path `/register?ref={Referral_Code}` for the displayed link.

---

### Requirement 3: Referral Attribution on Sign-Up

**User Story:** As a new developer, I want my sign-up to be automatically attributed to the person who referred me, so that they receive their bonus without any extra steps from me.

#### Acceptance Criteria

1. WHEN a visitor loads the registration page with a `ref` query parameter, THE Registration_Handler SHALL validate the parameter against known Referral_Codes.
2. WHEN the `ref` parameter matches a known Referral_Code, THE Registration_Handler SHALL set an HTTP-only `paymaster_ref` Attribution_Cookie with a 30-day expiry containing the validated Referral_Code.
3. WHEN the `ref` parameter does not match any known Referral_Code, THE Registration_Handler SHALL ignore the parameter and SHALL NOT set the Attribution_Cookie.
4. WHEN a new tenant account is created and an Attribution_Cookie is present, THE Registration_Handler SHALL record the association between the new tenant and the Referrer in the Referral_Store.
5. WHEN a new tenant account is created without an Attribution_Cookie, THE Registration_Handler SHALL create the account with no referral attribution.
6. THE Registration_Handler SHALL clear the Attribution_Cookie after recording the attribution.

---

### Requirement 4: Quota Bonus on First Successful Bump

**User Story:** As a referrer, I want to automatically receive a 1 000-stroop quota bonus when the developer I invited completes their first successful bump, so that I am rewarded for growing the platform.

#### Acceptance Criteria

1. WHEN a Referred_User's First_Bump is confirmed as successful by the Paymaster_Server, THE Bonus_Handler SHALL credit 1 000 stroops to the Referrer's quota via the Paymaster_Server API.
2. THE Bonus_Handler SHALL credit the Quota_Bonus exactly once per Referred_User, regardless of how many subsequent bumps the Referred_User performs.
3. WHEN the Paymaster_Server returns an error while crediting the Quota_Bonus, THE Bonus_Handler SHALL log the error and SHALL NOT mark the referral as rewarded, so that the credit can be retried.
4. WHEN the Referred_User's email is not yet verified at the time of the First_Bump, THE Bonus_Handler SHALL NOT credit the Quota_Bonus.
5. THE Bonus_Handler SHALL record the bonus event (referrer tenant ID, referred tenant ID, bonus amount in stroops, timestamp) in the Referral_Store.

---

### Requirement 5: Referral History Page

**User Story:** As a tenant, I want to view my referral history and total bonus credits, so that I can track the impact of my referrals.

#### Acceptance Criteria

1. THE Referral_History_Page SHALL display the total number of successful referrals made by the tenant.
2. THE Referral_History_Page SHALL display the cumulative Quota_Bonus earned by the tenant in stroops.
3. THE Referral_History_Page SHALL display a chronological list of referral events, each showing the referred tenant identifier (anonymised to first 8 characters), the bonus amount, and the event timestamp.
4. WHEN a tenant has no referral history, THE Referral_History_Page SHALL display an empty-state message indicating no referrals have been made yet.
5. THE Referral_History_Page SHALL be accessible at the path `/referrals` within the developer portal.

---

### Requirement 6: Referral Data API

**User Story:** As a developer building the referral UI, I want a stable internal API to read and write referral data, so that the page and bonus logic share a single source of truth.

#### Acceptance Criteria

1. THE Referral_Store SHALL expose a `getReferralData(tenantId)` function that returns the tenant's Referral_Code, list of referral events, and cumulative bonus.
2. THE Referral_Store SHALL expose a `recordReferral(referrerTenantId, referredTenantId)` function that stores the attribution and returns the new referral record.
3. THE Referral_Store SHALL expose a `markBonusCredited(referralId)` function that marks a referral as rewarded and records the timestamp.
4. THE Referral_Store SHALL expose a `lookupByCode(code)` function that returns the tenant ID associated with a Referral_Code, or `null` if not found.
5. FOR ALL valid referral records, serialising then deserialising the record SHALL produce an equivalent object (round-trip property).

---

### Requirement 7: Proxy Route for Quota Credit

**User Story:** As the system, I want the dashboard to proxy quota-credit requests to the Paymaster_Server, so that the dashboard never directly mutates backend state and the existing proxy pattern is preserved.

#### Acceptance Criteria

1. THE Quota_Proxy SHALL expose a `POST /api/referrals/credit` route that accepts `{ referrerId: string, bonusStroops: number }`.
2. WHEN the request is valid, THE Quota_Proxy SHALL forward the credit request to `{PAYMASTER_SERVER_URL}/admin/tenants/{referrerId}/quota-bonus` using the `PAYMASTER_ADMIN_TOKEN` header.
3. WHEN the Paymaster_Server responds with a non-2xx status, THE Quota_Proxy SHALL return the upstream status code and error body to the caller unchanged.
4. WHEN `referrerId` is missing or `bonusStroops` is not a positive integer, THE Quota_Proxy SHALL return HTTP 400 with a descriptive error message.
5. THE Quota_Proxy route SHALL require admin authentication before processing any request.
