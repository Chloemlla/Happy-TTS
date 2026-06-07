use std::{net::SocketAddr, time::Duration};

use tokio::{net::TcpStream, time};

#[derive(Debug, Clone)]
pub struct TcpProbeResult {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
}

pub async fn probe_socket_addrs(addresses: &[SocketAddr], timeout: Duration) -> TcpProbeResult {
    for address in addresses {
        let started_at = std::time::Instant::now();
        match time::timeout(timeout, TcpStream::connect(address)).await {
            Ok(Ok(_stream)) => {
                return TcpProbeResult {
                    reachable: true,
                    latency_ms: Some(started_at.elapsed().as_millis() as u64),
                };
            }
            Ok(Err(_)) | Err(_) => {}
        }
    }

    TcpProbeResult {
        reachable: false,
        latency_ms: None,
    }
}
