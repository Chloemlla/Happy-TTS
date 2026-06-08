use axum::http::HeaderMap;

use crate::{config::AudioWorkerConfig, error::AppError};

const INTERNAL_TOKEN_HEADER: &str = "x-internal-token";

pub fn require_internal_token(
    headers: &HeaderMap,
    config: &AudioWorkerConfig,
) -> Result<(), AppError> {
    let Some(value) = headers.get(INTERNAL_TOKEN_HEADER) else {
        return Err(AppError::Unauthorized);
    };

    let provided = value.to_str().map_err(|_| AppError::Forbidden)?;
    if constant_time_eq(provided.as_bytes(), config.internal_token.as_bytes()) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
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
