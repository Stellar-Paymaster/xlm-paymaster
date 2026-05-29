# API Analytics Export (BigQuery/S3)

## Overview

Enables automatic export of raw transaction data to data warehouses (BigQuery and/or S3). Allows enterprises to perform advanced analytics, auditing, and compliance reporting on API transaction data.

## Architecture

### Design

- **Flexible Destination Support**: Export to BigQuery, S3, or both simultaneously
- **Streaming Format**: NDJSON (newline-delimited JSON) for S3, native inserts for BigQuery
- **Error Handling**: Graceful failure with detailed error reporting
- **Connection Testing**: Pre-flight validation of data warehouse connections

### Core Components

`server/src/services/analyticsExport.ts`:
- `AnalyticsExporter` - Main export service
- `AnalyticsExportConfig` - Configuration interface
- `TransactionRecord` - Data model for transactions

## Configuration

```typescript
const config: AnalyticsExportConfig = {
  enableBigQuery: true,
  bigQueryProjectId: 'my-project',
  bigQueryDataset: 'analytics',
  bigQueryTable: 'transactions',
  enableS3: true,
  s3Bucket: 'my-analytics-bucket',
  s3Region: 'us-east-1',
  s3Prefix: 'data/analytics',
};

const exporter = new AnalyticsExporter(config);
```

## Transaction Record Schema

```typescript
interface TransactionRecord {
  id: string;
  tenantId: string;
  transactionHash: string;
  amount: string;
  assetCode: string;
  assetIssuer: string;
  sourceAccount: string;
  destinationAccount: string;
  timestamp: Date;
  status: 'success' | 'failed' | 'pending';
  fee: string;
  metadata?: Record<string, unknown>;
}
```

## Export Formats

### BigQuery

Exported rows include:
- `id`, `tenant_id`, `transaction_hash`
- `amount`, `asset_code`, `asset_issuer`
- `source_account`, `destination_account`
- `timestamp` (ISO 8601 format)
- `status`, `fee`, `metadata` (JSON string)
- `exported_at` (server timestamp)

Skips invalid rows using `skipInvalidRows: true`.

### S3

Format: NDJSON with automatic timestamped file naming
- Key pattern: `s3://{bucket}/{prefix}/analytics/transactions-{timestamp}.jsonl`
- Encryption: AES256 (default S3 encryption)
- One transaction per line, JSON format

Example:
```
{"id":"tx-1","tenantId":"tenant-1",...}
{"id":"tx-2","tenantId":"tenant-1",...}
```

## API Usage

### Initialization

```typescript
const exporter = await createAnalyticsExporter(config);
```

### Export Transactions

```typescript
const result = await exporter.exportTransactions(transactions);
// Result: { bigQuery?: string, s3?: string, error?: string }
```

### Test Connection

```typescript
const status = await exporter.testConnection();
// status: { bigQuery: boolean, s3: boolean, errors: Record<string, string> }
```

## Features

- ✓ Multi-destination export (BigQuery + S3 simultaneously)
- ✓ Batch processing for large transaction volumes
- ✓ Automatic timestamp generation
- ✓ Error handling with detailed messages
- ✓ Connection validation
- ✓ Optional metadata storage
- ✓ Transaction status tracking
- ✓ Comprehensive test coverage

## Test Coverage

17 test cases covering:
- Configuration initialization
- Single and batch exports
- BigQuery and S3 operations
- Error handling
- Connection testing
- Large batch processing (1000+ records)
- Timestamp formatting
- Optional field handling

## Integration

### With Server

To integrate with the main server:

```typescript
import { createAnalyticsExporter } from '@/services/analyticsExport';

const exporter = await createAnalyticsExporter({
  enableBigQuery: process.env.ENABLE_BIGQUERY === 'true',
  enableS3: process.env.ENABLE_S3 === 'true',
  // ... other config from environment
});

// On transaction completion
await exporter.exportTransactions([transactionRecord]);
```

## Environment Variables

```bash
# BigQuery
BIGQUERY_PROJECT_ID=my-project
BIGQUERY_DATASET=analytics
BIGQUERY_TABLE=transactions

# S3
S3_BUCKET=my-bucket
S3_REGION=us-east-1
S3_PREFIX=data/analytics

# Feature Flags
ENABLE_BIGQUERY=true
ENABLE_S3=true
```

## Security Considerations

- BigQuery: Uses Google Cloud authentication (service account recommended)
- S3: Uses AWS SDK credentials from environment
- Data: Automatically encrypted in S3 (AES256)
- Timestamps: UTC/ISO 8601 for consistency
- No sensitive data logged in export process

## Monitoring and Alerting

Export operations return detailed status:
- Success messages with record counts
- Error messages with root causes
- Connection test results for debugging

Recommended metrics to track:
- Records exported per batch
- Export latency (time to complete)
- Error rates by destination
- BigQuery insertion costs

## Performance Notes

- Batch exports are more efficient than single records
- BigQuery inserts are row-based, S3 is bulk file
- Large batches (1000+) automatically handled
- Concurrent exports to both destinations are parallel
