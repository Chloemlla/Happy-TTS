use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashRequest {
    pub items: Vec<String>,
    pub algorithm: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashItem {
    pub index: usize,
    pub hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashData {
    pub algorithm: String,
    pub items: Vec<HashItem>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Base64Request {
    pub operation: String,
    pub items: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Base64Item {
    pub index: usize,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Base64Data {
    pub operation: String,
    pub items: Vec<Base64Item>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodingConvertRequest {
    pub text_base64: String,
    pub from_encoding: String,
    pub to_encoding: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodingConvertData {
    pub text_base64: String,
    pub from_encoding: String,
    pub to_encoding: String,
    pub bytes: usize,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvInspectRequest {
    pub text: String,
    pub delimiter: Option<String>,
    pub has_header: Option<bool>,
    pub max_rows: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvInspectData {
    pub rows: usize,
    pub columns: usize,
    pub header: Option<Vec<String>>,
    pub consistent_columns: bool,
    pub warnings: Vec<String>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonInspectRequest {
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonInspectData {
    pub valid: bool,
    pub root_type: String,
    pub depth: usize,
    pub keys: usize,
    pub items: usize,
    pub error: Option<String>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionRequest {
    pub data_base64: String,
    pub algorithm: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionData {
    pub data_base64: String,
    pub algorithm: String,
    pub input_bytes: usize,
    pub output_bytes: usize,
    pub source: &'static str,
}

#[derive(Debug, Serialize)]
pub struct SuccessEnvelope<T> {
    pub success: bool,
    pub data: T,
}

impl<T> SuccessEnvelope<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data,
        }
    }
}

pub fn value_root_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}
