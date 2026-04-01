use std::collections::HashSet;
use std::fs;
use std::io::{Cursor, Error as IoError, ErrorKind};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use fluid_signer::{sign_payload, sign_payload_from_vault};
use napi::bindgen_prelude::Buffer;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::server::WebPkiClientVerifier;
use rustls::{RootCertStore, ServerConfig};
use sha2::{Digest, Sha256};
use tokio::net::{TcpListener, TcpStream};
use tokio::signal;
use tokio::sync::{mpsc, RwLock};
use tokio_rustls::server::TlsStream;
use tokio_rustls::TlsAcceptor;
use tokio_stream::wrappers::ReceiverStream;
use tonic::transport::Server;
use tonic::{Request, Response, Status};
use tracing::{error, info, warn};

pub mod proto {
    tonic::include_proto!("fluid.internal.signer.v1");
}

use proto::internal_signer_server::{InternalSigner, InternalSignerServer};
use proto::{
    HealthRequest, HealthResponse, SignPayloadFromVaultRequest, SignPayloadRequest,
    SignPayloadResponse,
};

#[derive(Clone)]
struct EngineConfig {
    listen_addr: SocketAddr,
    tls_cert_path: PathBuf,
    tls_key_path: PathBuf,
    tls_client_ca_path: PathBuf,
    pinned_client_cert_sha256: HashSet<String>,
}

impl EngineConfig {
    fn from_env() -> Result<Self, String> {
        let listen_addr = std::env::var("FLUID_GRPC_ENGINE_LISTEN_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:50051".to_string())
            .parse::<SocketAddr>()
            .map_err(|error| format!("invalid FLUID_GRPC_ENGINE_LISTEN_ADDR: {error}"))?;

        let tls_cert_path = required_path("FLUID_GRPC_ENGINE_TLS_CERT_PATH")?;
        let tls_key_path = required_path("FLUID_GRPC_ENGINE_TLS_KEY_PATH")?;
        let tls_client_ca_path = required_path("FLUID_GRPC_ENGINE_TLS_CLIENT_CA_PATH")?;
        let pinned_client_cert_sha256 = parse_fingerprint_set(
            std::env::var("FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256").ok(),
        );

        Ok(Self {
            listen_addr,
            tls_cert_path,
            tls_key_path,
            tls_client_ca_path,
            pinned_client_cert_sha256,
        })
    }
}

fn required_path(name: &str) -> Result<PathBuf, String> {
    let value = std::env::var(name).map_err(|_| format!("missing required env var {name}"))?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("missing required env var {name}"));
    }
    Ok(PathBuf::from(trimmed))
}

fn parse_fingerprint_set(value: Option<String>) -> HashSet<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(normalize_fingerprint)
        .collect()
}

fn normalize_fingerprint(value: impl AsRef<str>) -> String {
    value
        .as_ref()
        .trim()
        .strip_prefix("sha256:")
        .unwrap_or(value.as_ref().trim())
        .chars()
        .filter(|character| character.is_ascii_hexdigit())
        .collect::<String>()
        .to_ascii_lowercase()
}

fn fingerprint_der(der: &[u8]) -> String {
    hex::encode(Sha256::digest(der))
}

fn load_certificates(bytes: &[u8]) -> Result<Vec<CertificateDer<'static>>, IoError> {
    let mut reader = Cursor::new(bytes);
    rustls_pemfile::certs(&mut reader)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| IoError::new(ErrorKind::InvalidData, error.to_string()))
}

fn load_private_key(bytes: &[u8]) -> Result<PrivateKeyDer<'static>, IoError> {
    let mut reader = Cursor::new(bytes);
    rustls_pemfile::private_key(&mut reader)
        .map_err(|error| IoError::new(ErrorKind::InvalidData, error.to_string()))?
        .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "no private key found in PEM"))
}

fn build_server_config(
    cert_bytes: &[u8],
    key_bytes: &[u8],
    client_ca_bytes: &[u8],
) -> Result<(Arc<ServerConfig>, Vec<String>), IoError> {
    let cert_chain = load_certificates(cert_bytes)?;
    let key = load_private_key(key_bytes)?;
    let client_ca_chain = load_certificates(client_ca_bytes)?;

    let mut root_store = RootCertStore::empty();
    let (added, ignored) = root_store.add_parsable_certificates(client_ca_chain);
    if added == 0 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "client CA bundle did not contain any usable certificates",
        ));
    }
    if ignored > 0 {
        warn!("ignored {ignored} unparsable client CA certificates");
    }

    let verifier = WebPkiClientVerifier::builder(Arc::new(root_store))
        .build()
        .map_err(|error| IoError::new(ErrorKind::InvalidData, error.to_string()))?;

    let mut server_config = ServerConfig::builder()
        .with_client_cert_verifier(verifier)
        .with_single_cert(cert_chain.clone(), key)
        .map_err(|error| IoError::new(ErrorKind::InvalidData, error.to_string()))?;
    server_config.alpn_protocols = vec![b"h2".to_vec()];

    let fingerprints = cert_chain
        .iter()
        .map(|certificate| fingerprint_der(certificate.as_ref()))
        .collect();

    Ok((Arc::new(server_config), fingerprints))
}

struct CachedTlsConfig {
    cert_bytes: Vec<u8>,
    client_ca_bytes: Vec<u8>,
    key_bytes: Vec<u8>,
    server_config: Arc<ServerConfig>,
}

#[derive(Clone)]
struct ReloadingTlsConfig {
    cache: Arc<RwLock<Option<CachedTlsConfig>>>,
    config: EngineConfig,
}

impl ReloadingTlsConfig {
    fn new(config: EngineConfig) -> Self {
        Self {
            cache: Arc::new(RwLock::new(None)),
            config,
        }
    }

    async fn current_server_config(&self) -> Result<Arc<ServerConfig>, IoError> {
        let cert_bytes = fs::read(&self.config.tls_cert_path)?;
        let key_bytes = fs::read(&self.config.tls_key_path)?;
        let client_ca_bytes = fs::read(&self.config.tls_client_ca_path)?;

        {
            let guard = self.cache.read().await;
            if let Some(cached) = guard.as_ref() {
                if cached.cert_bytes == cert_bytes
                    && cached.key_bytes == key_bytes
                    && cached.client_ca_bytes == client_ca_bytes
                {
                    return Ok(Arc::clone(&cached.server_config));
                }
            }
        }

        let (server_config, server_fingerprints) =
            build_server_config(&cert_bytes, &key_bytes, &client_ca_bytes)?;

        info!(
            server_cert_sha256 = ?server_fingerprints,
            cert_path = %self.config.tls_cert_path.display(),
            client_ca_path = %self.config.tls_client_ca_path.display(),
            "reloaded gRPC engine TLS material"
        );

        let mut guard = self.cache.write().await;
        *guard = Some(CachedTlsConfig {
            cert_bytes,
            client_ca_bytes,
            key_bytes,
            server_config: Arc::clone(&server_config),
        });

        Ok(server_config)
    }
}

#[derive(Default)]
struct InternalSignerService;

#[tonic::async_trait]
impl InternalSigner for InternalSignerService {
    async fn health(
        &self,
        _request: Request<HealthRequest>,
    ) -> Result<Response<HealthResponse>, Status> {
        Ok(Response::new(HealthResponse {
            status: "ok".to_string(),
        }))
    }

    async fn sign_payload(
        &self,
        request: Request<SignPayloadRequest>,
    ) -> Result<Response<SignPayloadResponse>, Status> {
        let request = request.into_inner();
        let signature = sign_payload(request.secret, Buffer::from(request.payload))
            .await
            .map_err(|error| Status::internal(error.to_string()))?;

        Ok(Response::new(SignPayloadResponse {
            signature: signature.to_vec(),
        }))
    }

    async fn sign_payload_from_vault(
        &self,
        request: Request<SignPayloadFromVaultRequest>,
    ) -> Result<Response<SignPayloadResponse>, Status> {
        let request = request.into_inner();
        let signature = sign_payload_from_vault(
            request.vault_addr,
            request.vault_token,
            request.approle_role_id,
            request.approle_secret_id,
            request.kv_mount,
            request.kv_version as u8,
            request.secret_path,
            request.secret_field,
            Buffer::from(request.payload),
        )
        .await
        .map_err(|error| Status::internal(error.to_string()))?;

        Ok(Response::new(SignPayloadResponse {
            signature: signature.to_vec(),
        }))
    }
}

fn client_fingerprint_matches(
    stream: &TlsStream<TcpStream>,
    expected_fingerprints: &HashSet<String>,
) -> bool {
    if expected_fingerprints.is_empty() {
        return true;
    }

    let peer_certificates = stream
        .get_ref()
        .1
        .peer_certificates()
        .unwrap_or_default();

    peer_certificates.iter().any(|certificate| {
        expected_fingerprints.contains(&fingerprint_der(certificate.as_ref()))
    })
}

async fn accept_tls_connections(
    listener: TcpListener,
    tls_config: ReloadingTlsConfig,
    pinned_client_fingerprints: HashSet<String>,
    sender: mpsc::Sender<Result<TlsStream<TcpStream>, IoError>>,
) -> Result<(), IoError> {
    loop {
        let (socket, remote_addr) = listener.accept().await?;
        let sender = sender.clone();
        let tls_config = tls_config.clone();
        let pinned_client_fingerprints = pinned_client_fingerprints.clone();

        tokio::spawn(async move {
            let server_config = match tls_config.current_server_config().await {
                Ok(server_config) => server_config,
                Err(error) => {
                    error!(%remote_addr, %error, "failed to load TLS material for incoming gRPC connection");
                    return;
                }
            };

            let tls_stream = match TlsAcceptor::from(server_config).accept(socket).await {
                Ok(tls_stream) => tls_stream,
                Err(error) => {
                    warn!(%remote_addr, %error, "gRPC mTLS handshake failed");
                    return;
                }
            };

            if !client_fingerprint_matches(&tls_stream, &pinned_client_fingerprints) {
                let presented = tls_stream
                    .get_ref()
                    .1
                    .peer_certificates()
                    .unwrap_or_default()
                    .iter()
                    .map(|certificate| fingerprint_der(certificate.as_ref()))
                    .collect::<Vec<_>>();
                warn!(
                    %remote_addr,
                    presented_client_cert_sha256 = ?presented,
                    expected_client_cert_sha256 = ?pinned_client_fingerprints,
                    "rejecting client certificate that did not match the pinned SHA-256 set"
                );
                return;
            }

            if sender.send(Ok(tls_stream)).await.is_err() {
                warn!("gRPC engine connection receiver dropped");
            }
        });
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tonic=info".into()),
        )
        .init();

    let config = EngineConfig::from_env().map_err(IoError::other)?;
    let tls_config = ReloadingTlsConfig::new(config.clone());
    let listener = TcpListener::bind(config.listen_addr).await?;
    let (sender, receiver) = mpsc::channel(128);
    let pinned_client_fingerprints = config.pinned_client_cert_sha256.clone();

    info!(
        listen_addr = %config.listen_addr,
        tls_cert_path = %config.tls_cert_path.display(),
        tls_key_path = %config.tls_key_path.display(),
        tls_client_ca_path = %config.tls_client_ca_path.display(),
        pinned_client_cert_sha256 = ?pinned_client_fingerprints,
        "starting internal gRPC signer engine with mutual TLS"
    );

    let accept_loop = tokio::spawn(accept_tls_connections(
        listener,
        tls_config,
        pinned_client_fingerprints,
        sender,
    ));

    let shutdown = async {
        if let Err(error) = signal::ctrl_c().await {
            error!(%error, "failed to listen for shutdown signal");
        }
    };

    Server::builder()
        .add_service(InternalSignerServer::new(InternalSignerService))
        .serve_with_incoming_shutdown(ReceiverStream::new(receiver), shutdown)
        .await?;

    accept_loop.abort();
    Ok(())
}
