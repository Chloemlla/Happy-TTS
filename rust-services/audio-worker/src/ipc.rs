use std::sync::Arc;

use base64::{engine::general_purpose, Engine as _};
use ipc_runtime::IpcRequest;
use serde_json::{json, Value};

use crate::{
    config::AudioWorkerConfig,
    error::AppError,
    models::{AudioProcessData, AudioProcessRequest, LoudnessSummary, SuccessEnvelope},
    processing,
};

pub async fn handle_request(config: Arc<AudioWorkerConfig>, request: IpcRequest) -> Value {
    if let Err(error) = require_internal_token(&request.token, &config) {
        return error_json(error);
    }

    if request.path == "/healthz" {
        return json!({
          "success": true,
          "data": {
            "status": "ok",
            "service": "audio-worker",
            "source": "rust-audio-worker"
          }
        });
    }

    if !request.method.eq_ignore_ascii_case("POST") {
        return error_json(AppError::BadRequest("IPC route requires POST".to_string()));
    }

    match request.path.as_str() {
        "/v1/audio/process" => parse_body::<AudioProcessRequest>(request.body)
            .and_then(|payload| process_audio(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        _ => error_json(AppError::BadRequest(format!(
            "unknown IPC route {}",
            request.path
        ))),
    }
}

fn process_audio(
    config: &AudioWorkerConfig,
    payload: AudioProcessRequest,
) -> Result<AudioProcessData, AppError> {
    let output_format = processing::normalize_output_format(&payload.output_format)?;
    processing::validate_content_hash(&payload.content_hash)?;
    processing::validate_task_id(payload.task_id.as_deref())?;

    let operations = processing::normalize_operations(payload.operations.as_deref())?;
    processing::validate_base64_decoded_size(
        &payload.audio_base64,
        config.max_bytes,
        "audioBase64",
        "audio payload",
    )?;
    let decoded = general_purpose::STANDARD
        .decode(payload.audio_base64.as_bytes())
        .map_err(|_| AppError::BadRequest("audioBase64 must be valid base64".to_string()))?;

    if decoded.is_empty() {
        return Err(AppError::BadRequest(
            "audio payload is required".to_string(),
        ));
    }
    if decoded.len() > config.max_bytes {
        return Err(AppError::BadRequest(format!(
            "audio payload cannot exceed {} bytes",
            config.max_bytes
        )));
    }

    let processed = processing::process_audio_bytes(decoded, &output_format, &operations)?;
    let audio_base64 = general_purpose::STANDARD.encode(&processed.bytes);

    Ok(AudioProcessData {
        output_format,
        duration_ms: processed.duration_ms,
        size: processed.bytes.len(),
        loudness: Some(LoudnessSummary {
            integrated_lufs: None,
        }),
        audio_base64,
        metadata: processed.metadata,
        source: "rust-audio-worker",
    })
}

fn require_internal_token(token: &str, config: &AudioWorkerConfig) -> Result<(), AppError> {
    if token.trim().is_empty() {
        return Err(AppError::Unauthorized);
    }
    if token != config.internal_token {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

fn parse_body<T>(body: Value) -> Result<T, AppError>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(body)
        .map_err(|error| AppError::BadRequest(format!("invalid IPC body: {error}")))
}

fn envelope_json<T>(envelope: SuccessEnvelope<T>) -> Value
where
    T: serde::Serialize,
{
    serde_json::to_value(envelope).unwrap_or_else(|error| {
        json!({
            "success": false,
            "error": format!("failed to serialize IPC response: {error}")
        })
    })
}

fn error_json(error: AppError) -> Value {
    json!({
        "success": false,
        "error": error.to_string()
    })
}
