use crate::{
    config::NetworkToolsConfig,
    validation::{
        is_blocked_ip, normalize_address, normalize_concurrency, normalize_ports,
        normalize_timeout_ms,
    },
};

fn test_config() -> NetworkToolsConfig {
    NetworkToolsConfig {
        bind_addr: "127.0.0.1:4010".to_string(),
        internal_token: "test-token".to_string(),
        default_timeout_ms: 3000,
        max_timeout_ms: 10_000,
        max_ports: 3,
        max_concurrency: 4,
        block_private_targets: true,
    }
}

#[test]
fn rejects_empty_and_url_like_addresses() {
    assert!(normalize_address("", true).is_err());
    assert!(normalize_address("https://example.com", true).is_err());
    assert!(normalize_address("example.com/path", true).is_err());
}

#[test]
fn accepts_valid_public_hostname() {
    assert_eq!(
        normalize_address("Example.COM", true).unwrap(),
        "example.com"
    );
}

#[test]
fn blocks_private_addresses_when_enabled() {
    assert!(normalize_address("127.0.0.1", true).is_err());
    assert!(normalize_address("10.0.0.1", true).is_err());
    assert!(normalize_address("localhost", true).is_err());
}

#[test]
fn allows_private_addresses_when_disabled() {
    assert_eq!(normalize_address("127.0.0.1", false).unwrap(), "127.0.0.1");
}

#[test]
fn recognizes_reserved_ip_ranges() {
    assert!(is_blocked_ip("169.254.1.1".parse().unwrap()));
    assert!(is_blocked_ip("fc00::1".parse().unwrap()));
    assert!(!is_blocked_ip("8.8.8.8".parse().unwrap()));
}

#[test]
fn enforces_timeout_limit() {
    let config = test_config();
    assert_eq!(normalize_timeout_ms(None, &config).unwrap(), 3000);
    assert!(normalize_timeout_ms(Some(10_001), &config).is_err());
}

#[test]
fn enforces_ports_limit_and_deduplicates() {
    let config = test_config();
    assert_eq!(
        normalize_ports(&[443, 80, 443], &config).unwrap(),
        vec![80, 443]
    );
    assert!(normalize_ports(&[1, 2, 3, 4], &config).is_err());
    assert!(normalize_ports(&[], &config).is_err());
}

#[test]
fn enforces_concurrency_limit() {
    let config = test_config();
    assert_eq!(
        normalize_concurrency(None, &config).unwrap(),
        32.min(config.max_concurrency)
    );
    assert!(normalize_concurrency(Some(0), &config).is_err());
    assert!(normalize_concurrency(Some(5), &config).is_err());
}
