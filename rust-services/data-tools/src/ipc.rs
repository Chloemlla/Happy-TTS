use std::sync::Arc;

use base64::{engine::general_purpose, Engine as _};
use ipc_runtime::IpcRequest;
use serde_json::{json, Value};

use crate::{
    config::DataToolsConfig,
    error::AppError,
    models::{
        Base64Data, Base64Item, Base64Request, CompressionData, CompressionRequest, CsvInspectData,
        CsvInspectRequest, EncodingConvertData, EncodingConvertRequest, HashData, HashItem,
        HashRequest, JsonInspectData, JsonInspectRequest, SuccessEnvelope,
    },
    processing,
};

pub async fn handle_request(config: Arc<DataToolsConfig>, request: IpcRequest) -> Value {
    if let Err(error) = require_internal_token(&request.token, &config) {
        return error_json(error);
    }

    if request.path == "/healthz" {
        return json!({
          "success": true,
          "data": {
            "status": "ok",
            "service": "data-tools",
            "source": "rust-data-tools"
          }
        });
    }

    if !request.method.eq_ignore_ascii_case("POST") {
        return error_json(AppError::BadRequest("IPC route requires POST".to_string()));
    }

    match request.path.as_str() {
        "/v1/data/hash" => parse_body::<HashRequest>(request.body)
            .and_then(|payload| hash(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/data/base64" => parse_body::<Base64Request>(request.body)
            .and_then(|payload| base64_batch(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/data/encoding/convert" => parse_body::<EncodingConvertRequest>(request.body)
            .and_then(|payload| convert_encoding(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/data/csv/inspect" => parse_body::<CsvInspectRequest>(request.body)
            .and_then(|payload| inspect_csv(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/data/json/inspect" => parse_body::<JsonInspectRequest>(request.body)
            .and_then(|payload| inspect_json(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/data/compress" => parse_body::<CompressionRequest>(request.body)
            .and_then(|payload| compress(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/data/decompress" => parse_body::<CompressionRequest>(request.body)
            .and_then(|payload| decompress(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        _ => error_json(AppError::BadRequest(format!(
            "unknown IPC route {}",
            request.path
        ))),
    }
}

fn hash(config: &DataToolsConfig, payload: HashRequest) -> Result<HashData, AppError> {
    processing::validate_items(&payload.items, config)?;
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

    Ok(HashData {
        algorithm,
        items,
        source: "rust-data-tools",
    })
}

fn base64_batch(config: &DataToolsConfig, payload: Base64Request) -> Result<Base64Data, AppError> {
    processing::validate_items(&payload.items, config)?;
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

    Ok(Base64Data {
        operation,
        items,
        source: "rust-data-tools",
    })
}

fn convert_encoding(
    config: &DataToolsConfig,
    payload: EncodingConvertRequest,
) -> Result<EncodingConvertData, AppError> {
    let converted = processing::convert_encoding(
        &payload.text_base64,
        &payload.from_encoding,
        &payload.to_encoding,
        config,
    )?;

    Ok(EncodingConvertData {
        text_base64: general_purpose::STANDARD.encode(&converted),
        from_encoding: payload.from_encoding,
        to_encoding: payload.to_encoding,
        bytes: converted.len(),
        source: "rust-data-tools",
    })
}

fn inspect_csv(
    config: &DataToolsConfig,
    payload: CsvInspectRequest,
) -> Result<CsvInspectData, AppError> {
    processing::validate_text(&payload.text, config)?;
    let max_rows = payload.max_rows.unwrap_or(1000).min(config.max_items);
    processing::inspect_csv(
        &payload.text,
        payload.delimiter.as_deref(),
        payload.has_header.unwrap_or(true),
        max_rows,
    )
}

fn inspect_json(
    config: &DataToolsConfig,
    payload: JsonInspectRequest,
) -> Result<JsonInspectData, AppError> {
    processing::validate_text(&payload.text, config)?;
    Ok(processing::inspect_json(&payload.text))
}

fn compress(
    config: &DataToolsConfig,
    payload: CompressionRequest,
) -> Result<CompressionData, AppError> {
    let algorithm = processing::normalize_compression_algorithm(
        payload.algorithm.as_deref().unwrap_or("gzip"),
    )?;
    let input = processing::decode_limited_base64(
        &payload.data_base64,
        config,
        "dataBase64",
        "data payload",
    )?;
    let input_bytes = input.len();
    let compressed = processing::compress_bytes(&input, &algorithm)?;

    Ok(CompressionData {
        data_base64: general_purpose::STANDARD.encode(&compressed),
        algorithm,
        input_bytes,
        output_bytes: compressed.len(),
        source: "rust-data-tools",
    })
}

fn decompress(
    config: &DataToolsConfig,
    payload: CompressionRequest,
) -> Result<CompressionData, AppError> {
    let algorithm = processing::normalize_compression_algorithm(
        payload.algorithm.as_deref().unwrap_or("gzip"),
    )?;
    let input = processing::decode_limited_base64(
        &payload.data_base64,
        config,
        "dataBase64",
        "data payload",
    )?;
    let input_bytes = input.len();
    let decompressed = processing::decompress_bytes(&input, &algorithm, config)?;

    Ok(CompressionData {
        data_base64: general_purpose::STANDARD.encode(&decompressed),
        algorithm,
        input_bytes,
        output_bytes: decompressed.len(),
        source: "rust-data-tools",
    })
}

fn require_internal_token(token: &str, config: &DataToolsConfig) -> Result<(), AppError> {
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
