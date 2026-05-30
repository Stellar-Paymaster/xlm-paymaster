# Granular Role-Based Access Control (RBAC)

To maintain professional-grade security and compliance standards, the Fluid API enforces granular RBAC for the admin dashboard. This limits the blast radius of compromised credentials and ensures employees only have access to what they need.

## Roles Defined

- **`super_admin`**: Full access to the system. Can perform treasury actions, sweep funds, change configurations, and manage users.
- **`audit_only`**: Read-only access to transaction histories, system logs, and compliance reports. Cannot mutate state.
- **`support_only`**: Basic read/write access to user management (e.g., resetting passwords, viewing user details) but explicitly blocked from financial operations, smart contract calls, and system configuration.

## Usage

Apply the `requireRole` middleware to your Express API routes.

### Example

```typescript
import { Router } from 'express';
import { requireRole, AdminRole } from '../middlewares/rbac.middleware';
import { getAuditLogs, resetUserPassword, sweepTreasury } from '../controllers/admin.controller';

const router = Router();

// 1. Audit logs: accessible by Admins and Auditors
router.get(
  '/audit-logs', 
  requireRole([AdminRole.SUPER_ADMIN, AdminRole.AUDIT_ONLY]), 
  getAuditLogs
);

// 2. Support tasks: accessible by Admins and Support
router.post(
  '/users/:id/reset-password', 
  requireRole([AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ONLY]), 
  resetUserPassword
);

// 3. Critical tasks: accessible ONLY by Admins
router.post('/treasury/sweep', requireRole([AdminRole.SUPER_ADMIN]), sweepTreasury);

export default router;
```
