use axum::http::HeaderMap;

use crate::{config::DataToolsConfig, error::AppError};

const INTERNAL_TOKEN_HEADER: &str = "x-internal-token";

pub fn require_internal_token(
    headers: &HeaderMap,
    config: &DataToolsConfig,
) -> Result<(), AppError> {
    let Some(value) = headers.get(INTERNAL_TOKEN_HEADER) else {
        return Err(AppError::Unauthorized);
    };
    let Ok(token) = value.to_str() else {
        return Err(AppError::Forbidden);
    };
    if !constant_time_eq(token.as_bytes(), config.internal_token.as_bytes()) {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

pub(crate) fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }

    let mut diff = 0u8;
    for (left_byte, right_byte) in left.iter().zip(right.iter()) {
        diff |= left_byte ^ right_byte;
    }
    diff == 0
}
