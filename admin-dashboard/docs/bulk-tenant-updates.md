# Bulk Tenant Updates

## Overview
This feature allows administrators to apply rate limits to a large group of tenants simultaneously within the `admin-dashboard` package.

## Requirements
- Target specific groups of tenants based on usage tiers.
- Efficient database updates with error handling.

## Implementation Details
The `BulkTenantUpdateService` loops through the provided tenant IDs and applies the new rate limit values. It returns a summary of successful and failed operations.
