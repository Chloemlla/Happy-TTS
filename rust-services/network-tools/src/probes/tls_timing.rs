use std::{net::SocketAddr, sync::Arc, time::Duration};

use tokio::{net::TcpStream, time};
use tokio_rustls::{
    rustls::{pki_types::ServerName, ClientConfig, RootCertStore},
    TlsConnector,
};
use x509_parser::prelude::{FromDer, X509Certificate};

use crate::{
    error::AppError,
    models::{TlsCertificateSummary, TlsTimingData},
    validation,
};

pub async fn probe_tls(
    address: &str,
    port: u16,
    server_name: &str,
    timeout: Duration,
    block_private_targets: bool,
) -> Result<TlsTimingData, AppError> {
    time::timeout(
        timeout,
        probe_tls_inner(address, port, server_name, timeout, block_private_targets),
    )
    .await
    .map_err(|_| AppError::ProbeFailed)?
}

async fn probe_tls_inner(
    address: &str,
    port: u16,
    server_name: &str,
    timeout: Duration,
    block_private_targets: bool,
) -> Result<TlsTimingData, AppError> {
    let dns_started_at = std::time::Instant::now();
    let resolved = validation::resolve_target(address, port, block_private_targets).await?;
    let dns_ms = dns_started_at.elapsed().as_millis() as u64;

    let connect_started_at = std::time::Instant::now();
    let stream = connect_first(&resolved, timeout).await?;
    let connect_ms = connect_started_at.elapsed().as_millis() as u64;

    let tls_started_at = std::time::Instant::now();
    let server_name = ServerName::try_from(server_name.to_string())
        .map_err(|_| AppError::BadRequest("serverName is invalid for TLS".to_string()))?;
    let connector = TlsConnector::from(Arc::new(tls_client_config()));
    let stream = connector
        .connect(server_name, stream)
        .await
        .map_err(|_| AppError::ProbeFailed)?;
    let tls_handshake_ms = tls_started_at.elapsed().as_millis() as u64;

    let peer_certificates = stream.get_ref().1.peer_certificates();
    let certificate_count = peer_certificates
        .map(|certificates| certificates.len())
        .unwrap_or(0);
    let certificate = peer_certificates
        .and_then(|certificates| certificates.first())
        .and_then(|certificate| summarize_certificate(certificate.as_ref()));

    Ok(TlsTimingData {
        address: address.to_string(),
        port,
        dns_ms,
        connect_ms,
        tls_handshake_ms,
        certificate_count,
        certificate,
        source: "rust-network-tools",
    })
}

async fn connect_first(addresses: &[SocketAddr], timeout: Duration) -> Result<TcpStream, AppError> {
    for address in addresses {
        if let Ok(Ok(stream)) = time::timeout(timeout, TcpStream::connect(address)).await {
            return Ok(stream);
        }
    }

    Err(AppError::ProbeFailed)
}

fn summarize_certificate(der: &[u8]) -> Option<TlsCertificateSummary> {
    let (_, certificate) = X509Certificate::from_der(der).ok()?;

    Some(TlsCertificateSummary {
        subject: Some(certificate.subject().to_string()),
        issuer: Some(certificate.issuer().to_string()),
        not_after: Some(certificate.validity().not_after.to_string()),
    })
}

fn tls_client_config() -> ClientConfig {
    let mut root_store = RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth()
}
