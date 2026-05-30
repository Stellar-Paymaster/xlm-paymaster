// fluid-server/src/archive.rs
// Transaction Archival Job (Issue #238)

use aws_config::BehaviorVersion;
use aws_sdk_s3::Client as S3Client;
use chrono::{DateTime, Duration, Utc};
use sqlx::{PgPool, query, query_as};
use tracing::{info, error};

const BATCH_SIZE: i64 = 1000;
const OLDER_THAN_DAYS: i64 = 730; // 2 years

#[derive(sqlx::FromRow, serde::Serialize)]
struct Transaction {
    id: String,
    tx_hash: Option<String>,
    inner_tx_hash: String,
    tenant_id: Option<String>,
    status: String,
    cost_stroops: i64,
    category: String,
    chain: String,
    created_at: DateTime<Utc>,
}

pub async fn run_archival_job(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    info!("Starting transaction archival job");

    let cutoff_date = Utc::now() - Duration::days(OLDER_THAN_DAYS);
    info!("Archiving transactions older than: {}", cutoff_date);

    // Configure AWS S3
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let s3_client = S3Client::new(&config);
    let bucket_name = std::env::var("S3_ARCHIVE_BUCKET")
        .expect("S3_ARCHIVE_BUCKET environment variable not set");
    let prefix = std::env::var("S3_ARCHIVE_PREFIX").unwrap_or_else(|_| "transactions/".to_string());

    let mut total_archived = 0;
    let mut batch_num = 0;

    loop {
        let transactions = query_as::<_, Transaction>(
            r#"
            SELECT id, "txHash" as tx_hash, "innerTxHash" as inner_tx_hash, 
                   "tenantId" as tenant_id, status, "costStroops" as cost_stroops,
                   category, chain, "createdAt" as created_at
            FROM "Transaction"
            WHERE "createdAt" < $1
            ORDER BY "createdAt" ASC
            LIMIT $2
            "#,
        )
        .bind(cutoff_date)
        .bind(BATCH_SIZE)
        .fetch_all(pool)
        .await?;

        if transactions.is_empty() {
            break;
        }

        // Convert to JSON Lines format
        let json_lines: Vec<String> = transactions
            .iter()
            .map(|tx| serde_json::to_string(tx).unwrap())
            .collect();
        let body = json_lines.join("\n");

        // Upload to S3
        let key = format!("{}{}_{}.jsonl", prefix, Utc::now().format("%Y%m%d_%H%M%S"), batch_num);
        
        s3_client
            .put_object()
            .bucket(&bucket_name)
            .key(&key)
            .body(body.into())
            .content_type("application/x-ndjson")
            .send()
            .await?;

        // Delete archived transactions
        let ids: Vec<String> = transactions.iter().map(|tx| tx.id.clone()).collect();
        for id in ids {
            query(r#"DELETE FROM "Transaction" WHERE id = $1"#)
                .bind(id)
                .execute(pool)
                .await?;
        }

        total_archived += transactions.len();
        batch_num += 1;
        info!("Batch {}: Archived {} transactions to s3://{}/{}", 
              batch_num, transactions.len(), bucket_name, key);
    }

    info!("Archival job completed. Total archived: {} transactions", total_archived);
    Ok(())
}