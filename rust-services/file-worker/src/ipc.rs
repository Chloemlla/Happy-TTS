use std::sync::Arc;

use base64::{engine::general_purpose, Engine as _};
use ipc_runtime::IpcRequest;
use serde_json::{json, Value};

use crate::{
    config::FileWorkerConfig,
    detection::{self, archives, hashes, images, mime},
    error::AppError,
    models::{
        ArchiveInspectData, FileBytesRequest, FileInspectData, HashData, HashRequest,
        ImageInspectData, ImageProcessData, ImageProcessRequest, SuccessEnvelope,
    },
};

pub async fn handle_request(config: Arc<FileWorkerConfig>, request: IpcRequest) -> Value {
    if let Err(error) = require_internal_token(&request.token, &config) {
        return error_json(error);
    }

    if request.path == "/healthz" {
        return json!({
          "success": true,
          "data": {
            "status": "ok",
            "service": "file-worker",
            "source": "rust-file-worker"
          }
        });
    }

    if !request.method.eq_ignore_ascii_case("POST") {
        return error_json(AppError::BadRequest("IPC route requires POST".to_string()));
    }

    match request.path.as_str() {
        "/v1/file/inspect" => parse_body::<FileBytesRequest>(request.body)
            .and_then(|payload| inspect_file(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/file/hash" => parse_body::<HashRequest>(request.body)
            .and_then(|payload| hash_file(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/file/image/inspect" => parse_body::<FileBytesRequest>(request.body)
            .and_then(|payload| inspect_image(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/file/image/process" => parse_body::<ImageProcessRequest>(request.body)
            .and_then(|payload| process_image(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/file/archive/inspect" => parse_body::<FileBytesRequest>(request.body)
            .and_then(|payload| inspect_archive(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        _ => error_json(AppError::BadRequest(format!(
            "unknown IPC route {}",
            request.path
        ))),
    }
}

fn inspect_file(
    config: &FileWorkerConfig,
    payload: FileBytesRequest,
) -> Result<FileInspectData, AppError> {
    let bytes = decode_file_payload(&payload.file_base64, config)?;
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

    Ok(FileInspectData {
        size: bytes.len(),
        detected_mime: magic.mime.clone(),
        extension: magic.extension.clone(),
        sha256: hashes::sha256_hex(&bytes),
        magic,
        image,
        archive,
        warnings,
        source: "rust-file-worker",
    })
}

fn hash_file(config: &FileWorkerConfig, payload: HashRequest) -> Result<HashData, AppError> {
    let bytes = decode_file_payload(&payload.file_base64, config)?;
    let hashes = hashes::calculate_hashes(&bytes, payload.algorithms.as_deref())?;

    Ok(HashData {
        size: bytes.len(),
        hashes,
        source: "rust-file-worker",
    })
}

fn inspect_image(
    config: &FileWorkerConfig,
    payload: FileBytesRequest,
) -> Result<ImageInspectData, AppError> {
    let bytes = decode_file_payload(&payload.file_base64, config)?;
    let magic = mime::detect_magic(&bytes);
    let Some(image) = images::inspect_image(&bytes, &magic) else {
        return Err(AppError::BadRequest(
            "file is not a supported image".to_string(),
        ));
    };

    Ok(ImageInspectData {
        size: bytes.len(),
        detected_mime: magic.mime,
        image,
        source: "rust-file-worker",
    })
}

fn process_image(
    config: &FileWorkerConfig,
    payload: ImageProcessRequest,
) -> Result<ImageProcessData, AppError> {
    let bytes = decode_file_payload(&payload.file_base64, config)?;
    let magic = mime::detect_magic(&bytes);
    if images::inspect_image(&bytes, &magic).is_none() {
        return Err(AppError::BadRequest(
            "file is not a supported image".to_string(),
        ));
    }
    let operations = detection::normalize_operations(payload.operations.as_deref())?;
    let (processed, output_format, metadata) =
        images::process_image(bytes, payload.output_format.as_deref(), &operations)?;
    let image_base64 = general_purpose::STANDARD.encode(&processed);

    Ok(ImageProcessData {
        output_format,
        size: processed.len(),
        image_base64,
        metadata,
        source: "rust-file-worker",
    })
}

fn inspect_archive(
    config: &FileWorkerConfig,
    payload: FileBytesRequest,
) -> Result<ArchiveInspectData, AppError> {
    let bytes = decode_file_payload(&payload.file_base64, config)?;
    let magic = mime::detect_magic(&bytes);
    let Some(archive) = archives::inspect_archive(&bytes, &magic) else {
        return Err(AppError::BadRequest(
            "file is not a supported archive".to_string(),
        ));
    };

    Ok(ArchiveInspectData {
        size: bytes.len(),
        archive,
        source: "rust-file-worker",
    })
}

fn decode_file_payload(file_base64: &str, config: &FileWorkerConfig) -> Result<Vec<u8>, AppError> {
    detection::validate_base64_decoded_size(
        file_base64,
        config.max_bytes,
        "fileBase64",
        "file payload",
    )?;
    let decoded = general_purpose::STANDARD
        .decode(file_base64.as_bytes())
        .map_err(|_| AppError::BadRequest("fileBase64 must be valid base64".to_string()))?;
    detection::validate_bytes(&decoded, config)?;
    Ok(decoded)
}

fn require_internal_token(token: &str, config: &FileWorkerConfig) -> Result<(), AppError> {
    if token.trim().is_empty() {
        return Err(AppError::Unauthorized);
    }
    if !crate::auth::constant_time_eq(token.as_bytes(), config.internal_token.as_bytes()) {
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
