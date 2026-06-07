pub mod archives;
pub mod hashes;
pub mod images;
pub mod mime;

use crate::{config::FileWorkerConfig, error::AppError};

pub fn validate_file_name(file_name: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(file_name) = file_name else {
        return Ok(None);
    };
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > 255
        || trimmed
            .chars()
            .any(|value| value.is_ascii_control() || value == '/' || value == '\\')
    {
        return Err(AppError::BadRequest("fileName is invalid".to_string()));
    }
    Ok(Some(trimmed.to_string()))
}

pub fn validate_declared_mime(declared_mime: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(declared_mime) = declared_mime else {
        return Ok(None);
    };
    let normalized = declared_mime.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Ok(None);
    }
    if normalized.len() > 128
        || normalized
            .chars()
            .any(|value| value.is_ascii_control() || value.is_whitespace())
        || !normalized.contains('/')
    {
        return Err(AppError::BadRequest("declaredMime is invalid".to_string()));
    }
    Ok(Some(normalized))
}

pub fn validate_bytes(bytes: &[u8], config: &FileWorkerConfig) -> Result<(), AppError> {
    if bytes.is_empty() {
        return Err(AppError::BadRequest("file payload is required".to_string()));
    }
    if bytes.len() > config.max_bytes {
        return Err(AppError::BadRequest(format!(
            "file payload cannot exceed {} bytes",
            config.max_bytes
        )));
    }
    Ok(())
}

pub fn normalize_operations(operations: Option<&[String]>) -> Vec<String> {
    operations
        .filter(|operations| !operations.is_empty())
        .map(|operations| {
            operations
                .iter()
                .map(|operation| operation.trim().to_ascii_lowercase())
                .filter(|operation| !operation.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec!["inspect".to_string()])
}
