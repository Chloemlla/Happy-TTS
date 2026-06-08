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
    config::DataToolsConfig,
    error::AppError,
    models::{
        Base64Data, Base64Item, Base64Request, CompressionData, CompressionRequest, CsvInspectData,
        CsvInspectRequest, EncodingConvertData, EncodingConvertRequest, HashData, HashItem,
        HashRequest, JsonInspectData, JsonInspectRequest, SuccessEnvelope,
    },
    processing,
};

#[derive(Clone)]
struct AppState {
    config: Arc<DataToolsConfig>,
}

pub fn build_router(config: DataToolsConfig) -> Router {
    let state = AppState {
        config: Arc::new(config),
    };

    Router::new()
        .route("/healthz", get(healthz))
        .route("/v1/data/hash", post(hash))
        .route("/v1/data/base64", post(base64_batch))
        .route("/v1/data/encoding/convert", post(convert_encoding))
        .route("/v1/data/csv/inspect", post(inspect_csv))
        .route("/v1/data/json/inspect", post(inspect_json))
        .route("/v1/data/compress", post(compress))
        .route("/v1/data/decompress", post(decompress))
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
        "service": "data-tools",
        "source": "rust-data-tools"
      }
    })))
}

async fn hash(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<HashRequest>,
) -> Result<Json<SuccessEnvelope<HashData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    processing::validate_items(&payload.items, &state.config)?;
    let algorithm =
        processing::normalize_algorithm(payload.algorithm.as_deref().unwrap_or("sha256"))?;
    let items = payload
        .items
        .iter()
        .enumerate()
        .map(|(index, value)| {
            Ok(HashItem {
                index,
                hash: processing::hash_text(value, &algorithm)?,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    Ok(Json(SuccessEnvelope::ok(HashData {
        algorithm,
        items,
        source: "rust-data-tools",
    })))
}

async fn base64_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Base64Request>,
) -> Result<Json<SuccessEnvelope<Base64Data>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    processing::validate_items(&payload.items, &state.config)?;
    let operation = processing::normalize_base64_operation(&payload.operation)?;
    let items = payload
        .items
        .iter()
        .enumerate()
        .map(|(index, value)| {
            Ok(Base64Item {
                index,
                value: processing::base64_transform(value, &operation)?,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    Ok(Json(SuccessEnvelope::ok(Base64Data {
        operation,
        items,
        source: "rust-data-tools",
    })))
}

async fn convert_encoding(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EncodingConvertRequest>,
) -> Result<Json<SuccessEnvelope<EncodingConvertData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    let converted = processing::convert_encoding(
        &payload.text_base64,
        &payload.from_encoding,
        &payload.to_encoding,
        &state.config,
    )?;

    Ok(Json(SuccessEnvelope::ok(EncodingConvertData {
        text_base64: general_purpose::STANDARD.encode(&converted),
        from_encoding: payload.from_encoding,
        to_encoding: payload.to_encoding,
        bytes: converted.len(),
        source: "rust-data-tools",
    })))
}

async fn inspect_csv(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CsvInspectRequest>,
) -> Result<Json<SuccessEnvelope<CsvInspectData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    processing::validate_text(&payload.text, &state.config)?;
    let max_rows = payload.max_rows.unwrap_or(1000).min(state.config.max_items);
    let result = processing::inspect_csv(
        &payload.text,
        payload.delimiter.as_deref(),
        payload.has_header.unwrap_or(true),
        max_rows,
    )?;

    Ok(Json(SuccessEnvelope::ok(result)))
}

async fn inspect_json(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<JsonInspectRequest>,
) -> Result<Json<SuccessEnvelope<JsonInspectData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    processing::validate_text(&payload.text, &state.config)?;

    Ok(Json(SuccessEnvelope::ok(processing::inspect_json(
        &payload.text,
    ))))
}

async fn compress(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CompressionRequest>,
) -> Result<Json<SuccessEnvelope<CompressionData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    let algorithm = processing::normalize_compression_algorithm(
        payload.algorithm.as_deref().unwrap_or("gzip"),
    )?;
    let input =
        processing::decode_limited_base64(&payload.data_base64, &state.config, "dataBase64", "data payload")?;
    let input_bytes = input.len();
    let compressed = processing::compress_bytes(&input, &algorithm)?;

    Ok(Json(SuccessEnvelope::ok(CompressionData {
        data_base64: general_purpose::STANDARD.encode(&compressed),
        algorithm,
        input_bytes,
        output_bytes: compressed.len(),
        source: "rust-data-tools",
    })))
}

async fn decompress(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CompressionRequest>,
) -> Result<Json<SuccessEnvelope<CompressionData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    let algorithm = processing::normalize_compression_algorithm(
        payload.algorithm.as_deref().unwrap_or("gzip"),
    )?;
    let input =
        processing::decode_limited_base64(&payload.data_base64, &state.config, "dataBase64", "data payload")?;
    let input_bytes = input.len();
    let decompressed = processing::decompress_bytes(&input, &algorithm, &state.config)?;

    Ok(Json(SuccessEnvelope::ok(CompressionData {
        data_base64: general_purpose::STANDARD.encode(&decompressed),
        algorithm,
        input_bytes,
        output_bytes: decompressed.len(),
        source: "rust-data-tools",
    })))
}
