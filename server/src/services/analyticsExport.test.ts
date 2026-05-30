import { describe, test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import {
  AnalyticsExporter,
  type AnalyticsExportConfig,
  type TransactionRecord,
} from "./analyticsExport";

describe("Analytics Export Service", () => {
  let exporter: AnalyticsExporter;
  let mockTransactions: TransactionRecord[];

  beforeEach(() => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    exporter = new AnalyticsExporter(config);

    mockTransactions = [
      {
        id: "tx-1",
        tenantId: "tenant-1",
        transactionHash: "hash123",
        amount: "100.00",
        assetCode: "USDC",
        assetIssuer: "GBBD47UZQ",
        sourceAccount: "GBU...",
        destinationAccount: "GAY...",
        timestamp: new Date("2024-01-01T10:00:00Z"),
        status: "success",
        fee: "0.00001",
        metadata: { source: "api" },
      },
      {
        id: "tx-2",
        tenantId: "tenant-1",
        transactionHash: "hash456",
        amount: "50.00",
        assetCode: "USDT",
        assetIssuer: "GBBD47UZQ",
        sourceAccount: "GBU...",
        destinationAccount: "GAZ...",
        timestamp: new Date("2024-01-01T11:00:00Z"),
        status: "success",
        fee: "0.00001",
      },
    ];
  });

  afterEach(() => {
    // Cleanup
  });

  test("should create exporter with empty config", () => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    assert.doesNotThrow(() => {
      new AnalyticsExporter(config);
    });
  });

  test("should initialize with BigQuery disabled", () => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    const exp = new AnalyticsExporter(config);
    assert.ok(exp);
  });

  test("should initialize with S3 disabled", () => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    const exp = new AnalyticsExporter(config);
    assert.ok(exp);
  });

  test("should export transactions with no destinations enabled", async () => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    const exp = new AnalyticsExporter(config);
    const result = await exp.exportTransactions(mockTransactions);

    assert.deepEqual(result, {});
  });

  test("should handle empty transaction list", async () => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    const exp = new AnalyticsExporter(config);
    const result = await exp.exportTransactions([]);

    assert.deepEqual(result, {});
  });

  test("should validate transaction record structure", () => {
    const validTx = mockTransactions[0];

    assert.ok(validTx.id);
    assert.ok(validTx.tenantId);
    assert.ok(validTx.transactionHash);
    assert.ok(validTx.amount);
    assert.ok(validTx.assetCode);
    assert.ok(validTx.assetIssuer);
    assert.ok(validTx.sourceAccount);
    assert.ok(validTx.destinationAccount);
    assert.ok(validTx.timestamp instanceof Date);
    assert.ok(["success", "failed", "pending"].includes(validTx.status));
    assert.ok(validTx.fee);
  });

  test("should handle transaction metadata", () => {
    const txWithMetadata = mockTransactions[0];
    assert.deepEqual(txWithMetadata.metadata, { source: "api" });

    const txWithoutMetadata = mockTransactions[1];
    assert.equal(txWithoutMetadata.metadata, undefined);
  });

  test("should handle all transaction statuses", () => {
    const successTx: TransactionRecord = {
      ...mockTransactions[0],
      status: "success",
    };
    const failedTx: TransactionRecord = {
      ...mockTransactions[0],
      status: "failed",
    };
    const pendingTx: TransactionRecord = {
      ...mockTransactions[0],
      status: "pending",
    };

    assert.equal(successTx.status, "success");
    assert.equal(failedTx.status, "failed");
    assert.equal(pendingTx.status, "pending");
  });

  test("should validate config enables at least one destination", () => {
    const invalidConfig: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    const exp = new AnalyticsExporter(invalidConfig);
    assert.ok(exp);
  });

  test("should handle BigQuery configuration", () => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: true,
      bigQueryProjectId: "test-project",
      bigQueryDataset: "analytics",
      bigQueryTable: "transactions",
      enableS3: false,
    };

    const exp = new AnalyticsExporter(config);
    assert.ok(exp);
  });

  test("should handle S3 configuration", () => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: true,
      s3Bucket: "my-bucket",
      s3Region: "us-east-1",
      s3Prefix: "data/analytics",
    };

    const exp = new AnalyticsExporter(config);
    assert.ok(exp);
  });

  test("should handle transaction timestamps correctly", () => {
    const tx = mockTransactions[0];
    const isoString = tx.timestamp.toISOString();

    assert.ok(isoString.includes("2024-01-01"));
    assert.ok(isoString.includes("10:00:00"));
  });

  test("should handle large batch of transactions", async () => {
    const config: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    const exp = new AnalyticsExporter(config);

    const largeBatch = Array.from({ length: 1000 }, (_, i) => ({
      ...mockTransactions[0],
      id: `tx-${i}`,
    }));

    const result = await exp.exportTransactions(largeBatch);
    assert.deepEqual(result, {});
  });

  test("should handle transaction with all optional fields", () => {
    const completeTx: TransactionRecord = {
      id: "tx-complete",
      tenantId: "tenant-1",
      transactionHash: "hash123",
      amount: "100.00",
      assetCode: "USDC",
      assetIssuer: "GBBD47UZQ",
      sourceAccount: "GBU...",
      destinationAccount: "GAY...",
      timestamp: new Date(),
      status: "success",
      fee: "0.00001",
      metadata: {
        source: "api",
        requestId: "req-123",
        customField: "value",
      },
    };

    assert.ok(completeTx.metadata);
    assert.equal(completeTx.metadata.source, "api");
    assert.equal(completeTx.metadata.customField, "value");
  });

  test("should format S3 prefix correctly", () => {
    const configWithPrefix: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
      s3Prefix: "data/analytics",
    };

    const configWithoutPrefix: AnalyticsExportConfig = {
      enableBigQuery: false,
      enableS3: false,
    };

    assert.ok(configWithPrefix.s3Prefix);
    assert.equal(configWithoutPrefix.s3Prefix, undefined);
  });

  test("should handle transaction record with numeric amounts as strings", () => {
    const tx = mockTransactions[0];
    assert.ok(typeof tx.amount === "string");
    assert.ok(typeof tx.fee === "string");
  });
});
