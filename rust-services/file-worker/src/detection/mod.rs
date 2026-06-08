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

pub fn validate_base64_decoded_size(
    value: &str,
    max_bytes: usize,
    field: &str,
    payload_label: &str,
) -> Result<(), AppError> {
    if value.is_empty() {
        return Err(AppError::BadRequest(format!("{field} is required")));
    }
    if decoded_base64_upper_bound(value) > max_bytes {
        return Err(AppError::BadRequest(format!(
            "{payload_label} cannot exceed {max_bytes} bytes"
        )));
    }
    Ok(())
}

pub fn normalize_operations(operations: Option<&[String]>) -> Result<Vec<String>, AppError> {
    let requested = operations
        .filter(|operations| !operations.is_empty())
        .map(|operations| {
            operations
                .iter()
                .map(|operation| operation.trim().to_ascii_lowercase())
                .filter(|operation| !operation.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec!["inspect".to_string()]);

    let mut normalized = Vec::new();
    for operation in requested {
        match operation.as_str() {
            "inspect" | "exifcleanup" | "stripexif" | "compress" => {
                if !normalized.contains(&operation) {
                    normalized.push(operation);
                }
            }
            "webp" => {
                return Err(AppError::BadRequest(
                    "image WebP conversion is not supported without an encoder backend".to_string(),
                ));
            }
            _ => {
                return Err(AppError::BadRequest(format!(
                    "unsupported image operation: {operation}"
                )));
            }
        }
    }

    if normalized.is_empty() {
        normalized.push("inspect".to_string());
    }

    Ok(normalized)
}

fn decoded_base64_upper_bound(value: &str) -> usize {
    let padding = value
        .as_bytes()
        .iter()
        .rev()
        .take_while(|byte| **byte == b'=')
        .count()
        .min(2);
    value
        .len()
        .saturating_add(3)
        .checked_div(4)
        .unwrap_or(0)
        .saturating_mul(3)
        .saturating_sub(padding)
}
