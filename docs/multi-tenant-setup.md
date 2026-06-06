# Multi-Tenant Architecture & Sub-Tenants

The **XLM Paymaster** platform supports hierarchical multi-tenancy. This architecture is designed for resellers, enterprise business units, and partners who want to distribute transaction fee sponsorship capabilities to sub-organizations.

---

## Tenant Hierarchy

The system supports a two-level tenant hierarchy:

```
    ┌─────────────────────────┐
    │      Parent Tenant      │ (Enterprise/Reseller)
    └───────────┬─────────────┘
                │
         ┌──────┴──────┐
         ▼             ▼
  ┌─────────────┐┌─────────────┐
  │ Sub-Tenant  ││ Sub-Tenant  │ (Sub-organization/App)
  └─────────────┘└─────────────┘
```

### 1. Parent Tenant (Reseller)
* Has global configuration rights.
* Allocates sponsorship quotas to sub-tenants.
* Collects usage statistics and billing data.

### 2. Sub-Tenant (Client App)
* Operates under constraints defined by the Parent.
* Signs transactions using isolated signer pool credentials.
* Cannot view data from sibling sub-tenants under the same parent.

---

## API Configuration

To perform operations within a sub-tenant context, pass the target tenant ID via the `X-Tenant-Id` header:

```http
POST /admin/sub-tenants
X-Tenant-Id: parent-tenant-uuid
Content-Type: application/json

{
  "name": "Acme Subsidiary App"
}
```
