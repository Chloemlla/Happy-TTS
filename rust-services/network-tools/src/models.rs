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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingRequest {
    pub target: String,
    pub port: Option<u16>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingData {
    pub target: String,
    pub reachable: bool,
    pub method: String,
    pub port: Option<u16>,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedRequest {
    pub url: String,
    pub timeout_ms: Option<u64>,
    pub max_bytes: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedData {
    pub url: String,
    pub status_code: Option<u16>,
    pub bytes_read: usize,
    pub total_ms: u64,
    pub ttfb_ms: Option<u64>,
    pub throughput_bytes_per_sec: Option<f64>,
    pub truncated: bool,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRequest {
    pub address: String,
    pub record_types: Option<Vec<String>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRecord {
    pub record_type: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsData {
    pub address: String,
    pub records: Vec<DnsRecord>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpTimingRequest {
    pub url: String,
    pub method: Option<String>,
    pub timeout_ms: Option<u64>,
    pub max_bytes: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpTimingData {
    pub url: String,
    pub status_code: Option<u16>,
    pub dns_ms: u64,
    pub connect_ms: u64,
    pub tls_ms: Option<u64>,
    pub ttfb_ms: Option<u64>,
    pub total_ms: u64,
    pub bytes_read: usize,
    pub truncated: bool,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsTimingRequest {
    pub address: String,
    pub port: Option<u16>,
    pub server_name: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsCertificateSummary {
    pub subject: Option<String>,
    pub issuer: Option<String>,
    pub not_after: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsTimingData {
    pub address: String,
    pub port: u16,
    pub dns_ms: u64,
    pub connect_ms: u64,
    pub tls_handshake_ms: u64,
    pub certificate_count: usize,
    pub certificate: Option<TlsCertificateSummary>,
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
