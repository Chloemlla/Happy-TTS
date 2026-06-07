use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpingRequest {
    pub address: String,
    pub port: u16,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpingData {
    pub address: String,
    pub port: u16,
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortScanRequest {
    pub address: String,
    pub ports: Vec<u16>,
    pub timeout_ms: Option<u64>,
    pub concurrency: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortScanResult {
    pub port: u16,
    pub open: bool,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortScanData {
    pub address: String,
    pub scanned_ports: Vec<u16>,
    pub open_ports: Vec<u16>,
    pub results: Vec<PortScanResult>,
    pub source: &'static str,
}

#[derive(Debug, Serialize)]
pub struct SuccessEnvelope<T> {
    pub success: bool,
    pub data: T,
}

impl<T> SuccessEnvelope<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data,
        }
    }
}
