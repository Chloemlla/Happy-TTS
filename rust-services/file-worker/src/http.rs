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
    config::FileWorkerConfig,
    detection::{self, archives, hashes, images, mime},
    error::AppError,
    models::{
        ArchiveInspectData, FileBytesRequest, FileInspectData, HashData, HashRequest,
        ImageInspectData, ImageProcessData, ImageProcessRequest, SuccessEnvelope,
    },
};

#[derive(Clone)]
struct AppState {
    config: Arc<FileWorkerConfig>,
}

pub fn build_router(config: FileWorkerConfig) -> Router {
    let state = AppState {
        config: Arc::new(config),
    };

    Router::new()
        .route("/healthz", get(healthz))
        .route("/v1/file/inspect", post(inspect_file))
        .route("/v1/file/hash", post(hash_file))
        .route("/v1/file/image/inspect", post(inspect_image))
        .route("/v1/file/image/process", post(process_image))
        .route("/v1/file/archive/inspect", post(inspect_archive))
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
        "service": "file-worker",
        "source": "rust-file-worker"
      }
    })))
}

async fn inspect_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<FileBytesRequest>,
) -> Result<Json<SuccessEnvelope<FileInspectData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let bytes = decode_file_payload(&payload.file_base64, &state.config)?;
    let _file_name = detection::validate_file_name(payload.file_name.as_deref())?;
    let declared_mime = detection::validate_declared_mime(payload.declared_mime.as_deref())?;
    let magic = mime::detect_magic(&bytes);
    let image = images::inspect_image(&bytes, &magic);
    let archive = archives::inspect_archive(&bytes, &magic);
    let mut warnings = Vec::new();
    if let Some(declared_mime) = declared_mime {
        if declared_mime != magic.mime {
            warnings.push(format!(
                "declaredMime {declared_mime} does not match detected MIME {}",
                magic.mime
            ));
        }
    }

    Ok(Json(SuccessEnvelope::ok(FileInspectData {
        size: bytes.len(),
        detected_mime: magic.mime.clone(),
        extension: magic.extension.clone(),
        sha256: hashes::sha256_hex(&bytes),
        magic,
        image,
        archive,
        warnings,
        source: "rust-file-worker",
    })))
}

async fn hash_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<HashRequest>,
) -> Result<Json<SuccessEnvelope<HashData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let bytes = decode_file_payload(&payload.file_base64, &state.config)?;
    let hashes = hashes::calculate_hashes(&bytes, payload.algorithms.as_deref())?;

    Ok(Json(SuccessEnvelope::ok(HashData {
        size: bytes.len(),
        hashes,
        source: "rust-file-worker",
    })))
}

async fn inspect_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<FileBytesRequest>,
) -> Result<Json<SuccessEnvelope<ImageInspectData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let bytes = decode_file_payload(&payload.file_base64, &state.config)?;
    let magic = mime::detect_magic(&bytes);
    let Some(image) = images::inspect_image(&bytes, &magic) else {
        return Err(AppError::BadRequest(
            "file is not a supported image".to_string(),
        ));
    };

    Ok(Json(SuccessEnvelope::ok(ImageInspectData {
        size: bytes.len(),
        detected_mime: magic.mime,
        image,
        source: "rust-file-worker",
    })))
}

async fn process_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ImageProcessRequest>,
) -> Result<Json<SuccessEnvelope<ImageProcessData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let bytes = decode_file_payload(&payload.file_base64, &state.config)?;
    let magic = mime::detect_magic(&bytes);
    if images::inspect_image(&bytes, &magic).is_none() {
        return Err(AppError::BadRequest(
            "file is not a supported image".to_string(),
        ));
    }
    let operations = detection::normalize_operations(payload.operations.as_deref());
    let (processed, output_format, metadata) =
        images::process_image(bytes, payload.output_format.as_deref(), &operations);
    let image_base64 = general_purpose::STANDARD.encode(&processed);

    Ok(Json(SuccessEnvelope::ok(ImageProcessData {
        output_format,
        size: processed.len(),
        image_base64,
        metadata,
        source: "rust-file-worker",
    })))
}

async fn inspect_archive(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<FileBytesRequest>,
) -> Result<Json<SuccessEnvelope<ArchiveInspectData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let bytes = decode_file_payload(&payload.file_base64, &state.config)?;
    let magic = mime::detect_magic(&bytes);
    let Some(archive) = archives::inspect_archive(&bytes, &magic) else {
        return Err(AppError::BadRequest(
            "file is not a supported archive".to_string(),
        ));
    };

    Ok(Json(SuccessEnvelope::ok(ArchiveInspectData {
        size: bytes.len(),
        archive,
        source: "rust-file-worker",
    })))
}

fn decode_file_payload(file_base64: &str, config: &FileWorkerConfig) -> Result<Vec<u8>, AppError> {
    let decoded = general_purpose::STANDARD
        .decode(file_base64.as_bytes())
        .map_err(|_| AppError::BadRequest("fileBase64 must be valid base64".to_string()))?;
    detection::validate_bytes(&decoded, config)?;
    Ok(decoded)
}
