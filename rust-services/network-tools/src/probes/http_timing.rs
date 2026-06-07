use std::{net::SocketAddr, sync::Arc, time::Duration};

use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    net::TcpStream,
    time,
};
use tokio_rustls::{
    rustls::{pki_types::ServerName, ClientConfig, RootCertStore},
    TlsConnector,
};

use crate::{
    error::AppError,
    validation::{self, NormalizedHttpUrl},
};

#[derive(Debug, Clone)]
pub struct HttpProbeResult {
    pub status_code: Option<u16>,
    pub dns_ms: u64,
    pub connect_ms: u64,
    pub tls_ms: Option<u64>,
    pub ttfb_ms: Option<u64>,
    pub total_ms: u64,
    pub bytes_read: usize,
    pub truncated: bool,
}

pub async fn probe_url(
    target: &NormalizedHttpUrl,
    method: &str,
    timeout: Duration,
    max_bytes: usize,
    block_private_targets: bool,
) -> Result<HttpProbeResult, AppError> {
    time::timeout(
        timeout,
        probe_url_inner(target, method, timeout, max_bytes, block_private_targets),
    )
    .await
    .map_err(|_| AppError::ProbeFailed)?
}

async fn probe_url_inner(
    target: &NormalizedHttpUrl,
    method: &str,
    timeout: Duration,
    max_bytes: usize,
    block_private_targets: bool,
) -> Result<HttpProbeResult, AppError> {
    let total_started_at = std::time::Instant::now();

    let dns_started_at = std::time::Instant::now();
    let resolved =
        validation::resolve_target(&target.host, target.port, block_private_targets).await?;
    let dns_ms = dns_started_at.elapsed().as_millis() as u64;

    let connect_started_at = std::time::Instant::now();
    let stream = connect_first(&resolved, timeout).await?;
    let connect_ms = connect_started_at.elapsed().as_millis() as u64;

    if target.scheme == "https" {
        let tls_started_at = std::time::Instant::now();
        let server_name = ServerName::try_from(target.host.clone())
            .map_err(|_| AppError::BadRequest("url host is invalid for TLS".to_string()))?;
        let connector = TlsConnector::from(Arc::new(tls_client_config()));
        let mut stream = connector
            .connect(server_name, stream)
            .await
            .map_err(|_| AppError::ProbeFailed)?;
        let tls_ms = tls_started_at.elapsed().as_millis() as u64;

        read_http_response(
            &mut stream,
            target,
            method,
            max_bytes,
            total_started_at,
            dns_ms,
            connect_ms,
            Some(tls_ms),
        )
        .await
    } else {
        let mut stream = stream;
        read_http_response(
            &mut stream,
            target,
            method,
            max_bytes,
            total_started_at,
            dns_ms,
            connect_ms,
            None,
        )
        .await
    }
}

async fn connect_first(addresses: &[SocketAddr], timeout: Duration) -> Result<TcpStream, AppError> {
    for address in addresses {
        if let Ok(Ok(stream)) = time::timeout(timeout, TcpStream::connect(address)).await {
            return Ok(stream);
        }
    }

    Err(AppError::ProbeFailed)
}

async fn read_http_response<S>(
    stream: &mut S,
    target: &NormalizedHttpUrl,
    method: &str,
    max_bytes: usize,
    total_started_at: std::time::Instant,
    dns_ms: u64,
    connect_ms: u64,
    tls_ms: Option<u64>,
) -> Result<HttpProbeResult, AppError>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let request = format!(
        "{method} {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: Synapse network-tools/0.1\r\nAccept: */*\r\nConnection: close\r\n\r\n",
        target.path_and_query,
        target.host_header()
    );

    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|_| AppError::ProbeFailed)?;
    stream.flush().await.map_err(|_| AppError::ProbeFailed)?;

    let read_started_at = std::time::Instant::now();
    let mut ttfb_ms = None;
    let mut bytes_read = 0usize;
    let mut truncated = false;
    let mut first_bytes = Vec::new();
    let mut buffer = [0u8; 8192];

    loop {
        let read = stream
            .read(&mut buffer)
            .await
            .map_err(|_| AppError::ProbeFailed)?;
        if read == 0 {
            break;
        }

        if ttfb_ms.is_none() {
            ttfb_ms = Some(read_started_at.elapsed().as_millis() as u64);
        }

        if first_bytes.len() < 4096 {
            let remaining = 4096 - first_bytes.len();
            first_bytes.extend_from_slice(&buffer[..read.min(remaining)]);
        }

        let remaining = max_bytes.saturating_sub(bytes_read);
        bytes_read += read.min(remaining);
        if bytes_read >= max_bytes {
            truncated = true;
            break;
        }
    }

    Ok(HttpProbeResult {
        status_code: parse_status_code(&first_bytes),
        dns_ms,
        connect_ms,
        tls_ms,
        ttfb_ms,
        total_ms: total_started_at.elapsed().as_millis() as u64,
        bytes_read,
        truncated,
    })
}

fn parse_status_code(bytes: &[u8]) -> Option<u16> {
    let text = String::from_utf8_lossy(bytes);
    let status_line = text.lines().next()?;
    let mut parts = status_line.split_whitespace();
    let _http_version = parts.next()?;
    parts.next()?.parse::<u16>().ok()
}

fn tls_client_config() -> ClientConfig {
    let mut root_store = RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth()
}
