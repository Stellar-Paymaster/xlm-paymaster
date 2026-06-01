use std::net::SocketAddr;
use std::sync::Arc;

use tonic::{transport::Server, Request, Response, Status};
use tracing::info;

use crate::{sign_transaction_xdr_internal, SigningError};
use crate::rate_limiter::RateLimiter;

pub mod signer {
    tonic::include_proto!("signer");
}

use signer::signer_service_server::{SignerService, SignerServiceServer};
use signer::{SignRequest, SignResponse};

pub struct FluidSignerGrpc {
    rate_limiter: Arc<RateLimiter>,
}

impl FluidSignerGrpc {
    pub fn new(rate_limiter: Arc<RateLimiter>) -> Self {
        FluidSignerGrpc { rate_limiter }
    }
}

#[tonic::async_trait]
impl SignerService for FluidSignerGrpc {
    async fn sign(&self, request: Request<SignRequest>) -> Result<Response<SignResponse>, Status> {
        // Extract client IP or use a default key
        let client_ip = request
            .remote_addr()
            .map(|addr| addr.to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // Check rate limit (100 requests per 60 seconds per IP)
        let rate_limit_key = format!("grpc-sign:{}", client_ip);
        if !self
            .rate_limiter
            .is_allowed_with_limits(&rate_limit_key, 100, 60_000)
            .await
        {
            return Err(Status::resource_exhausted(
                "Rate limit exceeded for this endpoint",
            ));
        }

        let request = request.into_inner();

        if request.xdr.trim().is_empty() {
            return Err(Status::invalid_argument("xdr is required"));
        }
        if request.secret_key.trim().is_empty() {
            return Err(Status::invalid_argument("secret_key is required"));
        }
        if request.network_passphrase.trim().is_empty() {
            return Err(Status::invalid_argument("network_passphrase is required"));
        }

        info!(
            "SignRequest received | xdr_len={} | client={}",
            request.xdr.len(),
            client_ip
        );

        let result = sign_transaction_xdr_internal(
            &request.xdr,
            &request.secret_key,
            &request.network_passphrase,
        )
        .map_err(map_signing_error)?;

        info!(
            "SignResponse sent | signer={} signatures={} | client={}",
            result.signer_public_key, result.signature_count, client_ip
        );

        Ok(Response::new(SignResponse {
            signed_xdr: result.signed_xdr,
            signer_public_key: result.signer_public_key,
            transaction_hash_hex: result.transaction_hash_hex,
            signature_count: result.signature_count as u32,
        }))
    }
}

fn map_signing_error(error: SigningError) -> Status {
    match error {
        SigningError::InvalidSecretKey(message) => Status::invalid_argument(message),
        SigningError::InvalidEnvelope(message) => Status::invalid_argument(message),
        SigningError::UnsupportedEnvelope(message) => Status::failed_precondition(message),
        SigningError::SignatureOverflow => Status::resource_exhausted(error.to_string()),
        SigningError::AccountBlocked(message) => Status::permission_denied(message),
        SigningError::SuspiciousActivity(message) => Status::permission_denied(message),
    }
}

pub async fn serve_grpc(addr: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
    info!("Fluid signer gRPC listening on {addr}");

    // Initialize rate limiter: 100 requests per 60 seconds per IP
    let rate_limiter = Arc::new(RateLimiter::new(100, 60_000));

    let signer = FluidSignerGrpc::new(rate_limiter.clone());

    Server::builder()
        .add_service(SignerServiceServer::new(signer))
        .serve(addr)
        .await?;

    Ok(())
}
