# Public Testnet Node Deployment Guide

This guide explains how to deploy and maintain the Fluid public testnet node at `https://testnet.fluid.dev`.

## Overview

The public testnet node serves:
- Community developers building on Stellar
- Demo applications (NFT minting, token swaps, payments)
- Free tier: 100 fee-bump transactions per 24 hours per API key
- Monitoring: Health checks, uptime tracking, rate limiting

## Infrastructure Deployment Options

### Option 1: Railway (Recommended for Testnet)

**Why Railway**: Simple, cost-effective, automatic SSL, PostgreSQL/Redis included.

#### Setup Steps

1. **Create Railway Project**
   ```bash
   railway link
   # Select or create "fluid-public-testnet" project
   ```

2. **Configure Services**
   ```bash
   # Deploy using docker-compose.testnet.yml
   railway up
   ```

3. **Environment Variables in Railway Dashboard**
   ```
   NODE_ENV=production
   STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
   HORIZON_URL=https://horizon-testnet.stellar.org
   SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
   DATABASE_URL=<railway-postgres-url>
   REDIS_URL=<railway-redis-url>
   SIGNING_KEY=<sponsor-account-secret>
   SPONSOR_ACCOUNT=<sponsor-account-public>
   RATE_LIMIT_ENABLED=true
   RATE_LIMIT_WINDOW_MS=86400000
   RATE_LIMIT_DEFAULT_LIMIT=100
   FREE_TIER_LIMIT=100
   ```

4. **Custom Domain**
   - Railway Dashboard → Project Settings → Domains
   - Add custom domain: `testnet.fluid.dev`
   - Configure DNS: CNAME to Railway-provided URL

5. **SSL Certificate**
   - Automatic via Railway (Let's Encrypt)
   - No additional configuration needed

### Option 2: AWS (For Higher Availability)

Use existing Terraform infrastructure in `infra/terraform/multi-region/`.

#### Adapt for Testnet

1. **Create testnet-specific Terraform**
   ```bash
   cd infra/terraform/multi-region
   terraform workspace new testnet
   ```

2. **Set Testnet Variables**
   ```hcl
   # terraform.tfvars
   environment = "testnet"
   network_passphrase = "Test SDF Network ; September 2015"
   horizon_urls = ["https://horizon-testnet.stellar.org"]
   soroban_rpc_url = "https://soroban-testnet.stellar.org"
   instance_count = 1  # Single region for testnet
   rds_instance_class = "db.t3.micro"  # Cost-effective
   ```

3. **Deploy**
   ```bash
   terraform plan -var-file=testnet.tfvars
   terraform apply -var-file=testnet.tfvars
   ```

4. **Point DNS**
   - Route 53 Alias Record: `testnet.fluid.dev` → ALB endpoint
   - TTL: 300 seconds

## Service Architecture

```
┌─────────────────────────────────────────┐
│     nginx (SSL termination)             │
│       Port 80/443                       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│     Fluid API Server (Node.js)          │
│       Port 3000 (internal)              │
│   - /fee-bump (POST)                    │
│   - /health (GET)                       │
│   - /status (GET)                       │
│   - /admin/api-keys (POST/GET)          │
│   - /admin/rate-limits (GET)            │
└──────────────┬──────────────────────────┘
       ┌───────┴────────┬──────────┐
       │                │          │
    ┌──▼──┐         ┌──▼──┐   ┌──▼──┐
    │ PgSQL │       │Redis│   │Horizon
    │ 5432 │       │6379 │   │API
    └──────┘       └─────┘   └─────┘
```

## Rate Limiting Configuration

### Database Schema

```sql
-- API Keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  tier VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Rate limit usage tracking
CREATE TABLE rate_limit_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID REFERENCES api_keys(id),
  bumps_used INTEGER DEFAULT 0,
  window_start TIMESTAMP DEFAULT NOW(),
  window_end TIMESTAMP,
  reset_at TIMESTAMP
);
```

### Configuration

```javascript
// server/src/middleware/rateLimit.ts
const RATE_LIMITS = {
  free_tier: {
    bumps_per_day: 100,
    window_ms: 86400000  // 24 hours
  },
  pro_tier: {
    bumps_per_day: 10000,
    window_ms: 86400000
  },
  enterprise_tier: {
    bumps_per_day: null,  // Unlimited
    window_ms: null
  }
};
```

## Developer Portal API Key Flow

### User Registration Flow

1. **User Signs Up**
   - Email/GitHub login
   - Verify email
   - Generate initial API key

2. **API Key Management Page**
   - View all keys
   - Create new keys
   - Regenerate keys
   - Revoke keys
   - Set expiration dates

3. **Key Generation**
   ```bash
   # Generate 32-character random key
   head -c 32 /dev/urandom | base64 -w 0
   ```

4. **Store Securely**
   - Hash with bcrypt before storing
   - Never log raw keys
   - Show only once at creation

### Tier Assignment

```sql
-- Free tier: 100 bumps/24h
INSERT INTO subscription_tiers (
  name, tier_id, bumps_per_day, price_usd
) VALUES (
  'Free Testnet',
  'free_testnet',
  100,
  0
);
```

## Monitoring & Status Page

### Health Check Endpoint

```
GET /health
Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2026-04-27T10:30:00Z",
  "version": "0.1.0",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "horizon": "healthy",
    "soroban_rpc": "healthy"
  }
}
```

### Status Page Endpoints

```
GET /status - Overall status
GET /status/uptime - Uptime percentage (30d, 90d, 365d)
GET /status/incidents - Recent incidents
GET /status/response-times - API latency metrics
```

### Prometheus Metrics

```
# Enable Prometheus scraping
GET /metrics
# Exposes:
# - feebump_requests_total
# - feebump_latency_seconds
# - rate_limit_hits_total
# - database_query_duration_seconds
```

### Alerting

```yaml
# Alerts for critical issues
- name: HighErrorRate
  threshold: error_rate > 5%
  duration: 5m
  action: Slack alert + Page on-call

- name: HighLatency
  threshold: p95_latency > 5s
  duration: 5m
  action: Slack alert

- name: LowUptime
  threshold: uptime < 99.9%
  duration: 1h
  action: Email + Slack
```

## Maintenance

### Daily Checks

- [ ] Health check: `curl https://testnet.fluid.dev/health`
- [ ] Error rate < 1% in logs
- [ ] Database connection pool healthy
- [ ] Redis connection pool healthy

### Weekly Maintenance

- [ ] Review rate limit violations
- [ ] Check sponsor account balance
- [ ] Verify SSL certificate expiry (>14 days)
- [ ] Monitor API latency trends

### Monthly Maintenance

- [ ] Database cleanup (old rate_limit_usage records)
- [ ] Security audit (update dependencies)
- [ ] Capacity planning review
- [ ] Billing/cost analysis

## Failover & Recovery

### Database Failover

```bash
# Automated via RDS Multi-AZ or Railway
# If manual recovery needed:
pg_dump old_db | psql new_db
```

### Cache Failover

```bash
# Redis backup
redis-cli BGSAVE
# Restore
redis-cli --rdb /path/to/dump.rdb
```

### Manual Restart

```bash
# Railway
railway up --force

# AWS ECS
aws ecs update-service --cluster fluid-testnet --service api --force-new-deployment

# Docker
docker-compose -f docker-compose.testnet.yml restart
```

## Cost Optimization

### Railway Pricing
- Starting: ~$5-10/month for testnet
- Includes: 100 GB bandwidth, 1GB RAM, shared CPU
- Scale as needed

### AWS Pricing (Single Region)
- EC2: ~$10-20/month (t3.micro)
- RDS: ~$20-30/month (db.t3.micro)
- Total: ~$30-50/month

## Security Considerations

### API Key Validation

```typescript
// Validate API key on every request
async function validateApiKey(key: string): Promise<ApiKeyRecord> {
  const hashedKey = hash(key);
  return await db.apiKeys.findOne({ key_hash: hashedKey });
}
```

### Rate Limit Evasion Prevention

- Hash IP addresses for tracking
- Track unique API keys only
- No shared keys between users
- Monitor for distributed attacks

### Sponsor Account Security

- Use Vault or AWS Secrets Manager
- Rotate keys every 90 days
- Separate signing key per environment
- Monitor for suspicious transactions

## Deployment Checklist

- [ ] Database migrated and tested
- [ ] Redis configured and tested
- [ ] Environment variables set correctly
- [ ] SSL certificate installed
- [ ] DNS records pointing to endpoint
- [ ] Health check passing
- [ ] Rate limiting functional
- [ ] Sponsor account has sufficient balance
- [ ] Monitoring/alerting configured
- [ ] Developer portal live
- [ ] Documentation updated

## Rollback Procedures

```bash
# If issues detected, rollback to previous version
railway rollback <previous-deployment-id>

# Or restart with known-good container
docker pull stellar-fluid/fluid:v0.1.0
docker-compose -f docker-compose.testnet.yml up -d
```

## Support & Escalation

- **Issues**: GitHub Issues tagged `[testnet]`
- **Urgent**: PagerDuty on-call rotation
- **Maintenance Window**: Announced 48h in advance
- **SLA**: 99.5% uptime target for testnet
