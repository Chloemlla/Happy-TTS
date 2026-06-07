use std::env;

use thiserror::Error;

#[derive(Clone, Debug)]
pub struct SecurityWorkerConfig {
    pub bind_addr: String,
    pub internal_token: String,
    pub max_text_bytes: usize,
    pub max_rules: usize,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("INTERNAL_SERVICE_TOKEN is required")]
    MissingInternalToken,
    #[error("{key} must be a positive integer")]
    InvalidInteger { key: &'static str },
}

impl SecurityWorkerConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let internal_token = env::var("INTERNAL_SERVICE_TOKEN").unwrap_or_default();
        if internal_token.trim().is_empty() {
            return Err(ConfigError::MissingInternalToken);
        }

        Ok(Self {
            bind_addr: env::var("RUST_SECURITY_WORKER_BIND_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:4050".to_string()),
            internal_token,
            max_text_bytes: read_usize("RUST_SECURITY_WORKER_MAX_TEXT_BYTES", 2 * 1024 * 1024)?,
            max_rules: read_usize("RUST_SECURITY_WORKER_MAX_RULES", 2048)?,
        })
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
