pub mod analyze;
pub mod normalize;
pub mod passthrough;

use crate::error::AppError;
use serde_json::{json, Value};

const SUPPORTED_FORMATS: &[&str] = &["mp3", "opus", "aac", "flac", "wav", "pcm"];
const SUPPORTED_OPERATIONS: &[&str] = &[
    "passthrough",
    "analyze",
    "validatemagic",
    "metadatacleanup",
    "silencetrim",
    "loudnessnormalize",
    "normalize",
    "compress",
    "flactomp3",
];

pub struct ProcessedAudio {
    pub bytes: Vec<u8>,
    pub duration_ms: Option<u64>,
    pub metadata: Value,
}

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

pub fn process_audio_bytes(
    bytes: Vec<u8>,
    output_format: &str,
    operations: &[String],
) -> Result<ProcessedAudio, AppError> {
    let mut processed = passthrough::process(bytes);
    let mut analysis = analyze::analyze_audio(&processed, output_format);
    let mut warnings: Vec<String> = Vec::new();
    let mut applied: Vec<&str> = Vec::new();

    if operations
        .iter()
        .any(|operation| operation == "validatemagic")
    {
        if !analysis.magic_valid {
            return Err(AppError::BadRequest(format!(
                "audio magic bytes do not match outputFormat: {output_format}"
            )));
        }
        applied.push("validateMagic");
    }

    if operations
        .iter()
        .any(|operation| operation == "metadatacleanup")
    {
        let (cleaned, changed) = analyze::strip_id3v2_metadata(&processed);
        if changed {
            processed = cleaned;
            analysis = analyze::analyze_audio(&processed, output_format);
        }
        applied.push("metadataCleanup");
    }

    if operations
        .iter()
        .any(|operation| operation == "silencetrim")
    {
        warnings.push("silenceTrim was inspected but not applied because decoded PCM processing is not enabled".to_string());
    }
    if operations
        .iter()
        .any(|operation| operation == "loudnessnormalize" || operation == "normalize")
    {
        warnings.push(
            "loudness normalization was not applied because a DSP backend is not enabled"
                .to_string(),
        );
    }
    if operations.iter().any(|operation| operation == "compress") {
        warnings.push(
            "audio compression was not applied because an encoder backend is not enabled"
                .to_string(),
        );
    }
    if operations.iter().any(|operation| operation == "flactomp3") {
        warnings.push(
            "flacToMp3 was not applied because an MP3 encoder backend is not enabled".to_string(),
        );
    }

    let mut metadata = analysis.to_metadata();
    if let Some(object) = metadata.as_object_mut() {
        object.insert("operations".to_string(), json!(operations));
        object.insert("appliedOperations".to_string(), json!(applied));
        object.insert("warnings".to_string(), json!(warnings));
        object.insert(
            "passthrough".to_string(),
            json!(operations
                .iter()
                .any(|operation| operation == "passthrough")),
        );
    }

    Ok(ProcessedAudio {
        bytes: processed,
        duration_ms: analysis.duration_ms,
        metadata,
    })
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
