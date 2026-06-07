use std::{collections::BTreeSet, net::IpAddr, time::Duration};

use tokio::net::lookup_host;
use url::Url;

use crate::{config::NetworkToolsConfig, error::AppError};

const SUPPORTED_DNS_RECORD_TYPES: &[&str] = &["A", "AAAA", "CNAME", "MX", "TXT"];
const SUPPORTED_HTTP_METHODS: &[&str] = &["GET", "HEAD"];

#[derive(Debug, Clone)]
pub struct NormalizedHttpUrl {
    pub url: String,
    pub scheme: String,
    pub host: String,
    pub port: u16,
    pub path_and_query: String,
}

impl NormalizedHttpUrl {
    pub fn host_header(&self) -> String {
        let default_port = if self.scheme == "https" { 443 } else { 80 };
        if self.port == default_port {
            self.host.clone()
        } else {
            format!("{}:{}", self.host, self.port)
        }
    }
}

pub fn normalize_timeout_ms(
    requested: Option<u64>,
    config: &NetworkToolsConfig,
) -> Result<u64, AppError> {
    let timeout_ms = requested.unwrap_or(config.default_timeout_ms);
    if timeout_ms == 0 || timeout_ms > config.max_timeout_ms {
        return Err(AppError::BadRequest(format!(
            "timeoutMs must be between 1 and {}",
            config.max_timeout_ms
        )));
    }
    Ok(timeout_ms)
}

pub fn normalize_address(address: &str, block_private_targets: bool) -> Result<String, AppError> {
    let trimmed = address.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("address is required".to_string()));
    }
    if trimmed.len() > 253 {
        return Err(AppError::BadRequest("address is too long".to_string()));
    }
    if trimmed
        .chars()
        .any(|value| value.is_ascii_control() || value.is_whitespace())
    {
        return Err(AppError::BadRequest(
            "address contains invalid characters".to_string(),
        ));
    }
    if trimmed.contains("://")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('@')
        || trimmed.contains('#')
        || trimmed.contains('?')
        || trimmed.contains('&')
    {
        return Err(AppError::BadRequest(
            "address must be a hostname or IP address".to_string(),
        ));
    }

    if let Ok(ip) = trimmed.parse::<IpAddr>() {
        if block_private_targets && is_blocked_ip(ip) {
            return Err(AppError::BadRequest(
                "private or reserved target addresses are blocked".to_string(),
            ));
        }
        return Ok(trimmed.to_string());
    }

    let lowercase = trimmed.to_ascii_lowercase();
    if block_private_targets && (lowercase == "localhost" || lowercase.ends_with(".localhost")) {
        return Err(AppError::BadRequest(
            "private or reserved target addresses are blocked".to_string(),
        ));
    }

    if !is_valid_hostname(&lowercase) {
        return Err(AppError::BadRequest(
            "address must be a valid hostname or IP address".to_string(),
        ));
    }

    Ok(lowercase)
}

pub fn normalize_port(port: u16) -> Result<u16, AppError> {
    if port == 0 {
        return Err(AppError::BadRequest(
            "port must be between 1 and 65535".to_string(),
        ));
    }
    Ok(port)
}

pub fn normalize_ports(ports: &[u16], config: &NetworkToolsConfig) -> Result<Vec<u16>, AppError> {
    if ports.is_empty() {
        return Err(AppError::BadRequest("ports is required".to_string()));
    }
    if ports.len() > config.max_ports {
        return Err(AppError::BadRequest(format!(
            "ports cannot contain more than {}",
            config.max_ports
        )));
    }

    let mut unique_ports = BTreeSet::new();
    for port in ports {
        unique_ports.insert(normalize_port(*port)?);
    }

    Ok(unique_ports.into_iter().collect())
}

pub fn normalize_concurrency(
    requested: Option<usize>,
    config: &NetworkToolsConfig,
) -> Result<usize, AppError> {
    let concurrency = requested.unwrap_or_else(|| 32.min(config.max_concurrency));
    if concurrency == 0 || concurrency > config.max_concurrency {
        return Err(AppError::BadRequest(format!(
            "concurrency must be between 1 and {}",
            config.max_concurrency
        )));
    }
    Ok(concurrency)
}

pub fn normalize_max_response_bytes(
    requested: Option<usize>,
    config: &NetworkToolsConfig,
) -> Result<usize, AppError> {
    let max_bytes = requested.unwrap_or(config.max_response_bytes);
    if max_bytes == 0 || max_bytes > config.max_response_bytes {
        return Err(AppError::BadRequest(format!(
            "maxBytes must be between 1 and {}",
            config.max_response_bytes
        )));
    }
    Ok(max_bytes)
}

pub fn normalize_http_method(method: Option<&str>) -> Result<String, AppError> {
    let normalized = method
        .unwrap_or("GET")
        .trim()
        .to_ascii_uppercase();
    if !SUPPORTED_HTTP_METHODS.contains(&normalized.as_str()) {
        return Err(AppError::BadRequest(
            "method must be GET or HEAD".to_string(),
        ));
    }
    Ok(normalized)
}

pub fn normalize_dns_record_types(record_types: Option<&[String]>) -> Result<Vec<String>, AppError> {
    let requested = record_types
        .filter(|record_types| !record_types.is_empty())
        .map(|record_types| {
            record_types
                .iter()
                .map(|record_type| record_type.trim().to_ascii_uppercase())
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec!["A".to_string(), "AAAA".to_string()]);

    let mut normalized = Vec::new();
    for record_type in requested {
        if !SUPPORTED_DNS_RECORD_TYPES.contains(&record_type.as_str()) {
            return Err(AppError::BadRequest(format!(
                "unsupported DNS record type: {record_type}"
            )));
        }
        if !normalized.contains(&record_type) {
            normalized.push(record_type);
        }
    }

    Ok(normalized)
}

pub fn normalize_http_url(
    raw_url: &str,
    default_scheme: Option<&str>,
    block_private_targets: bool,
) -> Result<NormalizedHttpUrl, AppError> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("url is required".to_string()));
    }
    if trimmed.len() > 2048 || trimmed.chars().any(|value| value.is_ascii_control()) {
        return Err(AppError::BadRequest("url is invalid".to_string()));
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else if let Some(default_scheme) = default_scheme {
        format!("{default_scheme}://{trimmed}")
    } else {
        return Err(AppError::BadRequest(
            "url must include http or https scheme".to_string(),
        ));
    };

    let parsed = Url::parse(&candidate)
        .map_err(|_| AppError::BadRequest("url is invalid".to_string()))?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err(AppError::BadRequest(
            "url scheme must be http or https".to_string(),
        ));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(AppError::BadRequest(
            "url credentials are not allowed".to_string(),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::BadRequest("url host is required".to_string()))?;
    let host = normalize_address(host, block_private_targets)?;
    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| AppError::BadRequest("url port is invalid".to_string()))?;

    let mut path_and_query = parsed.path().to_string();
    if path_and_query.is_empty() {
        path_and_query.push('/');
    }
    if let Some(query) = parsed.query() {
        path_and_query.push('?');
        path_and_query.push_str(query);
    }

    Ok(NormalizedHttpUrl {
        url: parsed.to_string(),
        scheme,
        host,
        port,
        path_and_query,
    })
}

pub async fn resolve_target(
    address: &str,
    port: u16,
    block_private_targets: bool,
) -> Result<Vec<std::net::SocketAddr>, AppError> {
    let target = format!("{address}:{port}");
    let resolved: Vec<_> = lookup_host(target)
        .await
        .map_err(|_| AppError::BadRequest("address could not be resolved".to_string()))?
        .collect();

    if resolved.is_empty() {
        return Err(AppError::BadRequest(
            "address could not be resolved".to_string(),
        ));
    }

    if block_private_targets && resolved.iter().any(|addr| is_blocked_ip(addr.ip())) {
        return Err(AppError::BadRequest(
            "private or reserved target addresses are blocked".to_string(),
        ));
    }

    Ok(resolved)
}

pub fn duration_from_ms(timeout_ms: u64) -> Duration {
    Duration::from_millis(timeout_ms)
}

pub fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            let [first, second, third, _fourth] = ipv4.octets();
            ipv4.is_private()
                || ipv4.is_loopback()
                || ipv4.is_link_local()
                || ipv4.is_broadcast()
                || ipv4.is_unspecified()
                || ipv4.is_documentation()
                || ipv4.is_multicast()
                || first == 0
                || first >= 224
                || (first == 100 && (64..=127).contains(&second))
                || (first == 192 && second == 0 && third == 0)
                || (first == 198 && (18..=19).contains(&second))
        }
        IpAddr::V6(ipv6) => {
            let segments = ipv6.segments();
            let first = segments[0];
            ipv6.is_loopback()
                || ipv6.is_unspecified()
                || ipv6.is_multicast()
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80
                || (segments[0] == 0x2001 && segments[1] == 0x0db8)
        }
    }
}

fn is_valid_hostname(hostname: &str) -> bool {
    if hostname.ends_with('.') || !hostname.contains('.') {
        return false;
    }

    hostname.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label
                .chars()
                .all(|value| value.is_ascii_alphanumeric() || value == '-')
    })
}
