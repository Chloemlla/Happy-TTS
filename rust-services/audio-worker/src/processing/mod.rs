pub mod analyze;
pub mod normalize;
pub mod passthrough;

use crate::error::AppError;

const SUPPORTED_FORMATS: &[&str] = &["mp3", "opus", "aac", "flac", "wav", "pcm"];
const SUPPORTED_OPERATIONS: &[&str] = &["passthrough", "analyze"];

pub fn normalize_output_format(output_format: &str) -> Result<String, AppError> {
    let normalized = output_format.trim().to_ascii_lowercase();
    if SUPPORTED_FORMATS.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(AppError::BadRequest(format!(
            "unsupported outputFormat: {output_format}"
        )))
    }
}

pub fn validate_content_hash(content_hash: &str) -> Result<(), AppError> {
    let trimmed = content_hash.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || trimmed.chars().any(|value| value.is_ascii_control())
    {
        return Err(AppError::BadRequest("contentHash is invalid".to_string()));
    }
    Ok(())
}

pub fn validate_task_id(task_id: Option<&str>) -> Result<(), AppError> {
    let Some(task_id) = task_id else {
        return Ok(());
    };

    if task_id.len() > 128
        || task_id
            .chars()
            .any(|value| value.is_ascii_control() || value.is_whitespace())
    {
        return Err(AppError::BadRequest("taskId is invalid".to_string()));
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
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec!["passthrough".to_string(), "analyze".to_string()]);

    let mut normalized = Vec::new();
    for operation in requested {
        if !SUPPORTED_OPERATIONS.contains(&operation.as_str()) {
            return Err(AppError::BadRequest(format!(
                "unsupported audio operation: {operation}"
            )));
        }
        if !normalized.contains(&operation) {
            normalized.push(operation);
        }
    }

    if normalized.is_empty() {
        normalized.push("passthrough".to_string());
    }

    Ok(normalized)
}
