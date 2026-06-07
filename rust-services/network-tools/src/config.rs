use std::env;

use thiserror::Error;

#[derive(Clone, Debug)]
pub struct NetworkToolsConfig {
    pub bind_addr: String,
    pub internal_token: String,
    pub default_timeout_ms: u64,
    pub max_timeout_ms: u64,
    pub max_response_bytes: usize,
    pub max_ports: usize,
    pub max_concurrency: usize,
    pub block_private_targets: bool,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("INTERNAL_SERVICE_TOKEN is required")]
    MissingInternalToken,
    #[error("{key} must be a positive integer")]
    InvalidInteger { key: &'static str },
}

impl NetworkToolsConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let internal_token = env::var("INTERNAL_SERVICE_TOKEN").unwrap_or_default();
        if internal_token.trim().is_empty() {
            return Err(ConfigError::MissingInternalToken);
        }

        Ok(Self {
            bind_addr: env::var("RUST_BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:4010".to_string()),
            internal_token,
            default_timeout_ms: read_u64("RUST_NETWORK_TOOLS_DEFAULT_TIMEOUT_MS", 3000)?,
            max_timeout_ms: read_u64("RUST_NETWORK_TOOLS_MAX_TIMEOUT_MS", 10_000)?,
            max_response_bytes: read_usize("RUST_NETWORK_TOOLS_MAX_RESPONSE_BYTES", 1_048_576)?,
            max_ports: read_usize("RUST_NETWORK_TOOLS_MAX_PORTS", 128)?,
            max_concurrency: read_usize("RUST_NETWORK_TOOLS_MAX_CONCURRENCY", 64)?,
            block_private_targets: read_bool("RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS", true),
        })
    }
}

fn read_u64(key: &'static str, default_value: u64) -> Result<u64, ConfigError> {
    match env::var(key) {
        Ok(value) => value
            .parse::<u64>()
            .ok()
            .filter(|parsed| *parsed > 0)
            .ok_or(ConfigError::InvalidInteger { key }),
        Err(_) => Ok(default_value),
    }
}

fn read_usize(key: &'static str, default_value: usize) -> Result<usize, ConfigError> {
    match env::var(key) {
        Ok(value) => value
            .parse::<usize>()
            .ok()
            .filter(|parsed| *parsed > 0)
            .ok_or(ConfigError::InvalidInteger { key }),
        Err(_) => Ok(default_value),
    }
}

fn read_bool(key: &'static str, default_value: bool) -> bool {
    match env::var(key) {
        Ok(value) => !matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "false" | "0" | "no" | "off" | ""
        ),
        Err(_) => default_value,
    }
}
