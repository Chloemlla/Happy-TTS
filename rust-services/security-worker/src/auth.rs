use axum::http::HeaderMap;

use crate::{config::SecurityWorkerConfig, error::AppError};

const INTERNAL_TOKEN_HEADER: &str = "x-internal-token";

pub fn require_internal_token(
    headers: &HeaderMap,
    config: &SecurityWorkerConfig,
) -> Result<(), AppError> {
    let Some(value) = headers.get(INTERNAL_TOKEN_HEADER) else {
        return Err(AppError::Unauthorized);
    };
    let Ok(token) = value.to_str() else {
        return Err(AppError::Forbidden);
    };
    if token != config.internal_token {
        return Err(AppError::Forbidden);
    }
    Ok(())
}
