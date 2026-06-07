use crate::{
    config::NetworkToolsConfig,
    validation::{
        is_blocked_ip, normalize_address, normalize_concurrency, normalize_dns_record_types,
        normalize_http_method, normalize_http_url, normalize_max_response_bytes, normalize_ports,
        normalize_timeout_ms,
    },
};

fn test_config() -> NetworkToolsConfig {
    NetworkToolsConfig {
        bind_addr: "127.0.0.1:4010".to_string(),
        internal_token: "test-token".to_string(),
        default_timeout_ms: 3000,
        max_timeout_ms: 10_000,
        max_response_bytes: 1024,
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

#[test]
fn normalizes_http_urls_and_rejects_unsafe_variants() {
    let normalized = normalize_http_url("Example.COM/path?q=1", Some("https"), true).unwrap();
    assert_eq!(normalized.scheme, "https");
    assert_eq!(normalized.host, "example.com");
    assert_eq!(normalized.port, 443);
    assert_eq!(normalized.path_and_query, "/path?q=1");

    assert!(normalize_http_url("ftp://example.com", None, true).is_err());
    assert!(normalize_http_url("https://user:pass@example.com", None, true).is_err());
    assert!(normalize_http_url("http://127.0.0.1", None, true).is_err());
}

#[test]
fn normalizes_dns_record_types() {
    assert_eq!(
        normalize_dns_record_types(None).unwrap(),
        vec!["A".to_string(), "AAAA".to_string()]
    );
    assert_eq!(
        normalize_dns_record_types(Some(&[
            "txt".to_string(),
            "MX".to_string(),
            "txt".to_string()
        ]))
        .unwrap(),
        vec!["TXT".to_string(), "MX".to_string()]
    );
    assert!(normalize_dns_record_types(Some(&["SRV".to_string()])).is_err());
}

#[test]
fn enforces_http_method_and_response_size_limits() {
    let config = test_config();
    assert_eq!(normalize_http_method(None).unwrap(), "GET");
    assert_eq!(normalize_http_method(Some("head")).unwrap(), "HEAD");
    assert!(normalize_http_method(Some("POST")).is_err());
    assert_eq!(normalize_max_response_bytes(None, &config).unwrap(), 1024);
    assert_eq!(normalize_max_response_bytes(Some(512), &config).unwrap(), 512);
    assert!(normalize_max_response_bytes(Some(0), &config).is_err());
    assert!(normalize_max_response_bytes(Some(2048), &config).is_err());
}
