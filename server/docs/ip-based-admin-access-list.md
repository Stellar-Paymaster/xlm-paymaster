git # IP-based Admin Access List

**Status:** Implemented
**Scope:** `server/`
**Goal:** Restrict dashboard login to specific VPN or office IP ranges to enhance security and prevent unauthorized external access.

## 1. Overview

The `IpAccessControlService` provides robust matching for IPv4 and IPv6 CIDR blocks, automatically normalizing IPv4-mapped IPv6 addresses (e.g., `::ffff:192.168.1.1`). This service is consumed by `createAdminIpAccessMiddleware` to protect sensitive Express routes serving the administrative user interface.

## 2. Default Posture

- **Fail-Closed:** If the configured allowed ranges array is empty, the service denies all requests by default. This ensures that an accidental misconfiguration doesn't inadvertently expose the admin panel to the public internet.

## 3. Supported Formats

- Exact IPv4 (`192.168.1.50`)
- IPv4 CIDR blocks (`10.0.0.0/8`)
- Exact IPv6 (`2001:db8::1`)
- IPv6 CIDR blocks (`2001:db8:abcd:0012::/64`)
- IPv4-mapped IPv6 addresses evaluated natively against IPv4 CIDRs.

## 4. Usage Example

```typescript
import express from "express";
import { IpAccessControlService } from "./services/ipAccessControl";
import { createAdminIpAccessMiddleware } from "./middleware/adminIpAccessMiddleware";

const app = express();

// Populate this list from environment variables or a database in production
const allowedAdminIps = ["192.168.1.0/24", "10.0.0.0/8"];
const accessControl = new IpAccessControlService(allowedAdminIps);

// Apply to sensitive routes
app.use("/api/admin", createAdminIpAccessMiddleware(accessControl));
```