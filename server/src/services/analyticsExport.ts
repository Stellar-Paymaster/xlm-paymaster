import { BigQuery } from "@google-cloud/bigquery";
import * as AWS from "@aws-sdk/client-s3";

export interface AnalyticsExportConfig {
  enableBigQuery: boolean;
  bigQueryProjectId?: string;
  bigQueryDataset?: string;
  bigQueryTable?: string;
  enableS3: boolean;
  s3Bucket?: string;
  s3Region?: string;
  s3Prefix?: string;
}

export interface TransactionRecord {
  id: string;
  tenantId: string;
  transactionHash: string;
  amount: string;
  assetCode: string;
  assetIssuer: string;
  sourceAccount: string;
  destinationAccount: string;
  timestamp: Date;
  status: "success" | "failed" | "pending";
  fee: string;
  metadata?: Record<string, unknown>;
}

export class AnalyticsExporter {
  private bigquery: BigQuery | null = null;
  private s3Client: AWS.S3Client | null = null;
  private config: AnalyticsExportConfig;

  constructor(config: AnalyticsExportConfig) {
    this.config = config;

    if (config.enableBigQuery && config.bigQueryProjectId) {
      this.bigquery = new BigQuery({
        projectId: config.bigQueryProjectId,
      });
    }

    if (config.enableS3 && config.s3Region) {
      this.s3Client = new AWS.S3Client({ region: config.s3Region });
    }
  }

  async exportTransactions(
    transactions: TransactionRecord[]
  ): Promise<{ bigQuery?: string; s3?: string; error?: string }> {
    const results: { bigQuery?: string; s3?: string; error?: string } = {};

    try {
      if (this.config.enableBigQuery && this.bigquery) {
        results.bigQuery = await this.exportToBigQuery(transactions);
      }

      if (this.config.enableS3 && this.s3Client) {
        results.s3 = await this.exportToS3(transactions);
      }

      return results;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      return { error: errorMsg };
    }
  }

  private async exportToBigQuery(
    transactions: TransactionRecord[]
  ): Promise<string> {
    if (!this.bigquery || !this.config.bigQueryDataset || !this.config.bigQueryTable) {
      throw new Error("BigQuery not configured");
    }

    const dataset = this.bigquery.dataset(this.config.bigQueryDataset);
    const table = dataset.table(this.config.bigQueryTable);

    const rows = transactions.map((tx) => ({
      id: tx.id,
      tenant_id: tx.tenantId,
      transaction_hash: tx.transactionHash,
      amount: tx.amount,
      asset_code: tx.assetCode,
      asset_issuer: tx.assetIssuer,
      source_account: tx.sourceAccount,
      destination_account: tx.destinationAccount,
      timestamp: tx.timestamp.toISOString(),
      status: tx.status,
      fee: tx.fee,
      metadata: tx.metadata ? JSON.stringify(tx.metadata) : null,
      exported_at: new Date().toISOString(),
    }));

    try {
      await table.insert(rows, { raw: true, skipInvalidRows: true });
      return `Exported ${rows.length} transactions to BigQuery table ${this.config.bigQueryTable}`;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "BigQuery export failed";
      throw new Error(`BigQuery export error: ${errorMsg}`);
    }
  }

  private async exportToS3(
    transactions: TransactionRecord[]
  ): Promise<string> {
    if (!this.s3Client || !this.config.s3Bucket) {
      throw new Error("S3 not configured");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `analytics/transactions-${timestamp}.jsonl`;
    const key = this.config.s3Prefix
      ? `${this.config.s3Prefix}/${fileName}`
      : fileName;

    const content = transactions
      .map((tx) => JSON.stringify({
        ...tx,
        timestamp: tx.timestamp.toISOString(),
        exported_at: new Date().toISOString(),
      }))
      .join("\n");

    try {
      await this.s3Client.send(
        new AWS.PutObjectCommand({
          Bucket: this.config.s3Bucket,
          Key: key,
          Body: content,
          ContentType: "application/x-ndjson",
          ServerSideEncryption: "AES256",
        })
      );
      return `Exported ${transactions.length} transactions to S3 s3://${this.config.s3Bucket}/${key}`;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "S3 export failed";
      throw new Error(`S3 export error: ${errorMsg}`);
    }
  }

  async testConnection(): Promise<{
    bigQuery: boolean;
    s3: boolean;
    errors: Record<string, string>;
  }> {
    const errors: Record<string, string> = {};

    let bigQueryOk = false;
    if (this.config.enableBigQuery && this.bigquery) {
      try {
        await this.bigquery.getDatasets({ maxResults: 1 });
        bigQueryOk = true;
      } catch (error) {
        errors.bigQuery =
          error instanceof Error ? error.message : "BigQuery connection failed";
      }
    }

    let s3Ok = false;
    if (this.config.enableS3 && this.s3Client && this.config.s3Bucket) {
      try {
        await this.s3Client.send(
          new AWS.HeadBucketCommand({ Bucket: this.config.s3Bucket })
        );
        s3Ok = true;
      } catch (error) {
        errors.s3 =
          error instanceof Error ? error.message : "S3 connection failed";
      }
    }

    return { bigQuery: bigQueryOk, s3: s3Ok, errors };
  }
}

export async function createAnalyticsExporter(
  config: AnalyticsExportConfig
): Promise<AnalyticsExporter> {
  const exporter = new AnalyticsExporter(config);
  return exporter;
}
