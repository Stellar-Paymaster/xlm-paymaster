use chrono::{DateTime, Utc};
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;
use tracing::{error, info};
use uuid::Uuid;

/// Initialize PostgreSQL connection pool with configurable settings
pub async fn create_pool() -> Result<PgPool, sqlx::Error> {
    let database_url = std::env::var("DATABASE_URL").map_err(|error| {
        sqlx::Error::Configuration(Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("DATABASE_URL environment variable must be set: {error}"),
        )))
    })?;

    let max_connections = std::env::var("DB_MAX_CONNECTIONS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    let min_connections = std::env::var("DB_MIN_CONNECTIONS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(2);

    let acquire_timeout_secs = std::env::var("DB_ACQUIRE_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);

    let idle_timeout_secs = std::env::var("DB_IDLE_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(300);

    let max_lifetime_secs = std::env::var("DB_MAX_LIFETIME_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1800);

    info!(
        max_connections,
        min_connections,
        acquire_timeout_secs,
        idle_timeout_secs,
        max_lifetime_secs,
        "Creating database pool with configuration"
    );

    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .min_connections(min_connections)
        .acquire_timeout(Duration::from_secs(acquire_timeout_secs))
        .idle_timeout(Duration::from_secs(idle_timeout_secs))
        .max_lifetime(Duration::from_secs(max_lifetime_secs))
        .connect(&database_url)
        .await?;

    // Verify connection with a simple health check
    sqlx::query("SELECT 1").execute(&pool).await.map_err(|e| {
        error!("Database health check failed: {}", e);
        e
    })?;

    info!("Database pool created successfully");
    Ok(pool)
}

/// Tenant repository functions
pub struct TenantRepo;

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Tenant {
    pub id: String,
    pub name: String,
    pub api_key: String,
    pub created_at: DateTime<Utc>,
}

impl TenantRepo {
    /// Get tenant by ID
    #[allow(dead_code)]
    pub async fn get_by_id(pool: &PgPool, id: &str) -> Result<Option<Tenant>, sqlx::Error> {
        sqlx::query_as::<_, Tenant>(
            "SELECT id, name, \"apiKey\" as \"api_key\", \"createdAt\" as \"created_at\" FROM \"Tenant\" WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Get tenant by API key
    #[allow(dead_code)]
    pub async fn get_by_api_key(
        pool: &PgPool,
        api_key: &str,
    ) -> Result<Option<Tenant>, sqlx::Error> {
        sqlx::query_as::<_, Tenant>(
            "SELECT id, name, \"apiKey\" as \"api_key\", \"createdAt\" as \"created_at\" FROM \"Tenant\" WHERE \"apiKey\" = $1",
        )
        .bind(api_key)
        .fetch_optional(pool)
        .await
    }

    /// List all tenants
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Tenant>, sqlx::Error> {
        sqlx::query_as::<_, Tenant>(
            "SELECT id, name, \"apiKey\" as \"api_key\", \"createdAt\" as \"created_at\" FROM \"Tenant\" ORDER BY \"createdAt\" DESC",
        )
        .fetch_all(pool)
        .await
    }
}

/// ApiKey repository functions
#[allow(dead_code)]
pub struct ApiKeyRepo;

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct ApiKey {
    pub key: String,
    pub tenant_id: String,
    pub name: String,
    pub tier: String,
    pub max_requests: i32,
    pub window_ms: i32,
    pub daily_quota_stroops: i64,
    pub created_at: DateTime<Utc>,
}

impl ApiKeyRepo {
    /// Get API key with tenant information
    #[allow(dead_code)]
    pub async fn get_with_tenant(
        pool: &PgPool,
        key: &str,
    ) -> Result<Option<(ApiKey, Tenant)>, sqlx::Error> {
        // First get the API key
        let api_key = sqlx::query_as::<_, ApiKey>(
            r#"
            SELECT 
                key,
                "tenantId" as "tenant_id",
                name,
                tier,
                "maxRequests" as "max_requests",
                "windowMs" as "window_ms",
                "dailyQuotaStroops" as "daily_quota_stroops",
                "createdAt" as "created_at"
            FROM "ApiKey"
            WHERE key = $1
            "#,
        )
        .bind(key)
        .fetch_optional(pool)
        .await?;

        if let Some(ref ak) = api_key {
            // Now get the tenant associated with this API key
            if let Ok(Some(tenant)) = Self::get_tenant_by_id(pool, &ak.tenant_id).await {
                return Ok(Some((ak.clone(), tenant)));
            }
        }

        Ok(None)
    }

    /// Helper to get tenant by ID
    async fn get_tenant_by_id(pool: &PgPool, id: &str) -> Result<Option<Tenant>, sqlx::Error> {
        TenantRepo::get_by_id(pool, id).await
    }

    /// Validate if API key is active
    #[allow(dead_code)]
    pub async fn exists(pool: &PgPool, key: &str) -> Result<bool, sqlx::Error> {
        let result: (bool,) =
            sqlx::query_as("SELECT EXISTS(SELECT 1 FROM \"ApiKey\" WHERE key = $1)")
                .bind(key)
                .fetch_one(pool)
                .await?;
        Ok(result.0)
    }
}

/// Transaction repository functions
pub struct TransactionRepo;

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Transaction {
    pub hash: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl TransactionRepo {
    /// Insert a new transaction
    pub async fn insert(
        pool: &PgPool,
        hash: &str,
        status: &str,
    ) -> Result<Transaction, sqlx::Error> {
        let now = Utc::now();
        sqlx::query_as::<_, Transaction>(
            r#"
            INSERT INTO "Transaction" (hash, status, "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4)
            RETURNING hash, status, "createdAt" as "created_at", "updatedAt" as "updated_at"
            "#,
        )
        .bind(hash)
        .bind(status)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
    }

    /// Get transaction by hash
    #[allow(dead_code)]
    pub async fn get_by_hash(
        pool: &PgPool,
        hash: &str,
    ) -> Result<Option<Transaction>, sqlx::Error> {
        sqlx::query_as::<_, Transaction>(
            "SELECT hash, status, \"createdAt\" as \"created_at\", \"updatedAt\" as \"updated_at\" FROM \"Transaction\" WHERE hash = $1",
        )
        .bind(hash)
        .fetch_optional(pool)
        .await
    }

    /// Update transaction status
    #[allow(dead_code)]
    pub async fn update_status(
        pool: &PgPool,
        hash: &str,
        status: &str,
    ) -> Result<Option<Transaction>, sqlx::Error> {
        let now = Utc::now();
        sqlx::query_as::<_, Transaction>(
            r#"
            UPDATE "Transaction"
            SET status = $1, "updatedAt" = $2
            WHERE hash = $3
            RETURNING hash, status, "createdAt" as "created_at", "updatedAt" as "updated_at"
            "#,
        )
        .bind(status)
        .bind(now)
        .bind(hash)
        .fetch_optional(pool)
        .await
    }
}

/// SponsoredTransaction repository functions
#[allow(dead_code)]
pub struct SponsoredTransactionRepo;

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct SponsoredTransaction {
    pub id: String,
    pub tenant_id: String,
    pub fee_stroops: i64,
    pub created_at: DateTime<Utc>,
}

impl SponsoredTransactionRepo {
    /// Insert a new sponsored transaction
    #[allow(dead_code)]
    pub async fn insert(
        pool: &PgPool,
        tenant_id: &str,
        fee_stroops: i64,
    ) -> Result<SponsoredTransaction, sqlx::Error> {
        let now = Utc::now();
        let id = Uuid::new_v4().to_string();

        sqlx::query_as::<_, SponsoredTransaction>(
            r#"
            INSERT INTO "SponsoredTransaction" (id, "tenantId", "feeStroops", "createdAt")
            VALUES ($1, $2, $3, $4)
            RETURNING id, "tenantId" as "tenant_id", "feeStroops" as "fee_stroops", "createdAt" as "created_at"
            "#,
        )
        .bind(&id)
        .bind(tenant_id)
        .bind(fee_stroops)
        .bind(now)
        .fetch_one(pool)
        .await
    }
}
