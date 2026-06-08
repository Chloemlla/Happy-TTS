use std::sync::Arc;

use axum::{
    extract::State,
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose, Engine as _};
use serde_json::json;

use crate::{
    auth,
    config::AudioWorkerConfig,
    error::AppError,
    models::{AudioProcessData, AudioProcessRequest, LoudnessSummary, SuccessEnvelope},
    processing,
};

#[derive(Clone)]
struct AppState {
    config: Arc<AudioWorkerConfig>,
}

pub fn build_router(config: AudioWorkerConfig) -> Router {
    let state = AppState {
        config: Arc::new(config),
    };

    Router::new()
        .route("/healthz", get(healthz))
        .route("/v1/audio/process", post(process_audio))
        .with_state(state)
}

async fn healthz(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    Ok(Json(json!({
      "success": true,
      "data": {
        "status": "ok",
        "service": "audio-worker",
        "source": "rust-audio-worker"
      }
    })))
}

async fn process_audio(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AudioProcessRequest>,
) -> Result<Json<SuccessEnvelope<AudioProcessData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let output_format = processing::normalize_output_format(&payload.output_format)?;
    processing::validate_content_hash(&payload.content_hash)?;
    processing::validate_task_id(payload.task_id.as_deref())?;

    let operations = processing::normalize_operations(payload.operations.as_deref())?;
    processing::validate_base64_decoded_size(
        &payload.audio_base64,
        state.config.max_bytes,
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
    if decoded.len() > state.config.max_bytes {
        return Err(AppError::BadRequest(format!(
            "audio payload cannot exceed {} bytes",
            state.config.max_bytes
        )));
    }

    let processed = processing::process_audio_bytes(decoded, &output_format, &operations)?;
    let audio_base64 = general_purpose::STANDARD.encode(&processed.bytes);

    Ok(Json(SuccessEnvelope::ok(AudioProcessData {
        output_format,
        duration_ms: processed.duration_ms,
        size: processed.bytes.len(),
        loudness: Some(LoudnessSummary {
            integrated_lufs: None,
        }),
        audio_base64,
        metadata: processed.metadata,
        source: "rust-audio-worker",
    })))
}
