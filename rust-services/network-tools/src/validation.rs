use std::{collections::BTreeSet, net::IpAddr, time::Duration};

use tokio::net::lookup_host;

use crate::{config::NetworkToolsConfig, error::AppError};

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
