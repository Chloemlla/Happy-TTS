use std::io::{Read, Write};

use base64::{engine::general_purpose, Engine as _};
use flate2::{
    read::{DeflateDecoder, GzDecoder},
    write::{DeflateEncoder, GzEncoder},
    Compression,
};
use serde_json::Value;
use sha2::{Digest, Sha256, Sha512};

use crate::{
    config::DataToolsConfig,
    error::AppError,
    models::{value_root_type, CsvInspectData, JsonInspectData},
};

pub fn validate_items(items: &[String], config: &DataToolsConfig) -> Result<(), AppError> {
    if items.is_empty() {
        return Err(AppError::BadRequest("items is required".to_string()));
    }
    if items.len() > config.max_items {
        return Err(AppError::BadRequest(format!(
            "items cannot contain more than {}",
            config.max_items
        )));
    }
    let total_bytes: usize = items.iter().map(|item| item.len()).sum();
    if total_bytes > config.max_bytes {
        return Err(AppError::BadRequest(format!(
            "items payload cannot exceed {} bytes",
            config.max_bytes
        )));
    }
    Ok(())
}

pub fn validate_text(text: &str, config: &DataToolsConfig) -> Result<(), AppError> {
    if text.len() > config.max_bytes {
        return Err(AppError::BadRequest(format!(
            "text payload cannot exceed {} bytes",
            config.max_bytes
        )));
    }
    Ok(())
}

pub fn hash_text(value: &str, algorithm: &str) -> Result<String, AppError> {
    match normalize_algorithm(algorithm)?.as_str() {
        "sha256" => Ok(hex(&Sha256::digest(value.as_bytes()))),
        "sha512" => Ok(hex(&Sha512::digest(value.as_bytes()))),
        _ => Err(AppError::BadRequest(
            "unsupported hash algorithm".to_string(),
        )),
    }
}

pub fn normalize_algorithm(algorithm: &str) -> Result<String, AppError> {
    let normalized = algorithm.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "sha256" | "sha512" => Ok(normalized),
        _ => Err(AppError::BadRequest(format!(
            "unsupported hash algorithm: {algorithm}"
        ))),
    }
}

pub fn base64_transform(value: &str, operation: &str) -> Result<String, AppError> {
    match operation {
        "encode" => Ok(general_purpose::STANDARD.encode(value.as_bytes())),
        "decode" => {
            let decoded = general_purpose::STANDARD
                .decode(value.as_bytes())
                .map_err(|_| AppError::BadRequest("base64 item is invalid".to_string()))?;
            String::from_utf8(decoded)
                .map_err(|_| AppError::BadRequest("decoded base64 is not valid UTF-8".to_string()))
        }
        _ => Err(AppError::BadRequest(
            "operation must be encode or decode".to_string(),
        )),
    }
}

pub fn normalize_base64_operation(operation: &str) -> Result<String, AppError> {
    let normalized = operation.trim().to_ascii_lowercase();
    if normalized == "encode" || normalized == "decode" {
        Ok(normalized)
    } else {
        Err(AppError::BadRequest(
            "operation must be encode or decode".to_string(),
        ))
    }
}

pub fn convert_encoding(
    text_base64: &str,
    from_encoding: &str,
    to_encoding: &str,
    config: &DataToolsConfig,
) -> Result<Vec<u8>, AppError> {
    let input = decode_base64_limited(
        text_base64,
        config.max_bytes,
        "textBase64",
        "encoding payload",
    )?;

    let text = decode_text(&input, from_encoding)?;
    encode_text(&text, to_encoding)
}

pub fn inspect_csv(
    text: &str,
    delimiter: Option<&str>,
    has_header: bool,
    max_rows: usize,
) -> Result<CsvInspectData, AppError> {
    let delimiter = delimiter.unwrap_or(",").as_bytes();
    if delimiter.len() != 1 {
        return Err(AppError::BadRequest(
            "delimiter must be a single byte character".to_string(),
        ));
    }
    let delimiter = delimiter[0] as char;
    let mut rows = Vec::new();
    for line in text.lines().take(max_rows) {
        if line.trim().is_empty() {
            continue;
        }
        rows.push(parse_csv_line(line, delimiter));
    }

    let columns = rows.first().map(|row| row.len()).unwrap_or(0);
    let consistent_columns = rows.iter().all(|row| row.len() == columns);
    let header = if has_header && !rows.is_empty() {
        Some(rows[0].clone())
    } else {
        None
    };
    let mut warnings = Vec::new();
    if text.lines().count() > max_rows {
        warnings.push(format!("inspection truncated to {max_rows} rows"));
    }
    if !consistent_columns {
        warnings.push("rows have inconsistent column counts".to_string());
    }

    Ok(CsvInspectData {
        rows: rows.len(),
        columns,
        header,
        consistent_columns,
        warnings,
        source: "rust-data-tools",
    })
}

pub fn inspect_json(text: &str) -> JsonInspectData {
    match serde_json::from_str::<Value>(text) {
        Ok(value) => {
            let (depth, keys, items) = json_stats(&value);
            JsonInspectData {
                valid: true,
                root_type: value_root_type(&value).to_string(),
                depth,
                keys,
                items,
                error: None,
                source: "rust-data-tools",
            }
        }
        Err(error) => JsonInspectData {
            valid: false,
            root_type: "invalid".to_string(),
            depth: 0,
            keys: 0,
            items: 0,
            error: Some(error.to_string()),
            source: "rust-data-tools",
        },
    }
}

pub fn compress(
    data_base64: &str,
    algorithm: &str,
    config: &DataToolsConfig,
) -> Result<Vec<u8>, AppError> {
    let input = decode_limited(data_base64, config)?;
    compress_bytes(&input, algorithm)
}

pub fn compress_bytes(input: &[u8], algorithm: &str) -> Result<Vec<u8>, AppError> {
    match normalize_compression_algorithm(algorithm)?.as_str() {
        "gzip" => {
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder
                .write_all(input)
                .map_err(|_| AppError::BadRequest("gzip compression failed".to_string()))?;
            encoder
                .finish()
                .map_err(|_| AppError::BadRequest("gzip compression failed".to_string()))
        }
        "deflate" => {
            let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
            encoder
                .write_all(input)
                .map_err(|_| AppError::BadRequest("deflate compression failed".to_string()))?;
            encoder
                .finish()
                .map_err(|_| AppError::BadRequest("deflate compression failed".to_string()))
        }
        _ => Err(AppError::BadRequest(
            "unsupported compression algorithm".to_string(),
        )),
    }
}

pub fn decompress(
    data_base64: &str,
    algorithm: &str,
    config: &DataToolsConfig,
) -> Result<Vec<u8>, AppError> {
    let input = decode_limited(data_base64, config)?;
    decompress_bytes(&input, algorithm, config)
}

pub fn decompress_bytes(
    input: &[u8],
    algorithm: &str,
    config: &DataToolsConfig,
) -> Result<Vec<u8>, AppError> {
    match normalize_compression_algorithm(algorithm)?.as_str() {
        "gzip" => {
            let mut decoder = GzDecoder::new(input);
            read_decompressed_limited(&mut decoder, config, "gzip")
        }
        "deflate" => {
            let mut decoder = DeflateDecoder::new(input);
            read_decompressed_limited(&mut decoder, config, "deflate")
        }
        _ => Err(AppError::BadRequest(
            "unsupported compression algorithm".to_string(),
        )),
    }
}

pub fn normalize_compression_algorithm(algorithm: &str) -> Result<String, AppError> {
    let normalized = algorithm.trim().to_ascii_lowercase();
    if normalized == "gzip" || normalized == "deflate" {
        Ok(normalized)
    } else {
        Err(AppError::BadRequest(format!(
            "unsupported compression algorithm: {algorithm}"
        )))
    }
}

fn decode_limited(data_base64: &str, config: &DataToolsConfig) -> Result<Vec<u8>, AppError> {
    decode_base64_limited(data_base64, config.max_bytes, "dataBase64", "data payload")
}

pub fn decode_limited_base64(
    data_base64: &str,
    config: &DataToolsConfig,
    field: &str,
    payload_label: &str,
) -> Result<Vec<u8>, AppError> {
    decode_base64_limited(data_base64, config.max_bytes, field, payload_label)
}

fn decode_base64_limited(
    value: &str,
    max_bytes: usize,
    field: &str,
    payload_label: &str,
) -> Result<Vec<u8>, AppError> {
    if decoded_base64_upper_bound(value) > max_bytes {
        return Err(AppError::BadRequest(format!(
            "{payload_label} cannot exceed {max_bytes} bytes"
        )));
    }

    let input = general_purpose::STANDARD
        .decode(value.as_bytes())
        .map_err(|_| AppError::BadRequest(format!("{field} must be valid base64")))?;
    if input.len() > max_bytes {
        return Err(AppError::BadRequest(format!(
            "{payload_label} cannot exceed {max_bytes} bytes"
        )));
    }
    Ok(input)
}

fn read_decompressed_limited<R: Read>(
    reader: &mut R,
    config: &DataToolsConfig,
    algorithm: &str,
) -> Result<Vec<u8>, AppError> {
    let limit = config.max_bytes.saturating_add(1) as u64;
    let mut output = Vec::with_capacity(config.max_bytes.min(8192));
    reader
        .take(limit)
        .read_to_end(&mut output)
        .map_err(|_| AppError::BadRequest(format!("{algorithm} decompression failed")))?;

    if output.len() > config.max_bytes {
        return Err(AppError::BadRequest(format!(
            "decompressed payload cannot exceed {} bytes",
            config.max_bytes
        )));
    }

    Ok(output)
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

fn decode_text(bytes: &[u8], encoding: &str) -> Result<String, AppError> {
    match encoding.trim().to_ascii_lowercase().as_str() {
        "utf-8" | "utf8" => String::from_utf8(bytes.to_vec())
            .map_err(|_| AppError::BadRequest("input is not valid UTF-8".to_string())),
        "utf-16le" => decode_utf16(bytes, false),
        "utf-16be" => decode_utf16(bytes, true),
        other => Err(AppError::BadRequest(format!(
            "unsupported encoding: {other}"
        ))),
    }
}

fn encode_text(text: &str, encoding: &str) -> Result<Vec<u8>, AppError> {
    match encoding.trim().to_ascii_lowercase().as_str() {
        "utf-8" | "utf8" => Ok(text.as_bytes().to_vec()),
        "utf-16le" => Ok(text
            .encode_utf16()
            .flat_map(|value| value.to_le_bytes())
            .collect()),
        "utf-16be" => Ok(text
            .encode_utf16()
            .flat_map(|value| value.to_be_bytes())
            .collect()),
        other => Err(AppError::BadRequest(format!(
            "unsupported encoding: {other}"
        ))),
    }
}

fn decode_utf16(bytes: &[u8], big_endian: bool) -> Result<String, AppError> {
    if bytes.len() % 2 != 0 {
        return Err(AppError::BadRequest(
            "UTF-16 input must have an even byte length".to_string(),
        ));
    }
    let units = bytes.chunks_exact(2).map(|chunk| {
        if big_endian {
            u16::from_be_bytes([chunk[0], chunk[1]])
        } else {
            u16::from_le_bytes([chunk[0], chunk[1]])
        }
    });
    String::from_utf16(&units.collect::<Vec<_>>())
        .map_err(|_| AppError::BadRequest("input is not valid UTF-16".to_string()))
}

fn parse_csv_line(line: &str, delimiter: char) -> Vec<String> {
    let mut columns = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '"' {
            if in_quotes && chars.peek() == Some(&'"') {
                current.push('"');
                chars.next();
            } else {
                in_quotes = !in_quotes;
            }
        } else if ch == delimiter && !in_quotes {
            columns.push(current.trim().to_string());
            current.clear();
        } else {
            current.push(ch);
        }
    }
    columns.push(current.trim().to_string());
    columns
}

fn json_stats(value: &Value) -> (usize, usize, usize) {
    match value {
        Value::Array(items) => {
            let mut max_depth = 1;
            let mut keys = 0;
            let mut count = items.len();
            for item in items {
                let (depth, item_keys, item_count) = json_stats(item);
                max_depth = max_depth.max(depth + 1);
                keys += item_keys;
                count += item_count;
            }
            (max_depth, keys, count)
        }
        Value::Object(object) => {
            let mut max_depth = 1;
            let mut keys = object.len();
            let mut count = object.len();
            for value in object.values() {
                let (depth, child_keys, child_count) = json_stats(value);
                max_depth = max_depth.max(depth + 1);
                keys += child_keys;
                count += child_count;
            }
            (max_depth, keys, count)
        }
        _ => (1, 0, 1),
    }
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
