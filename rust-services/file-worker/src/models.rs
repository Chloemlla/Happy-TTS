use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileBytesRequest {
    pub file_base64: String,
    pub file_name: Option<String>,
    pub declared_mime: Option<String>,
    pub operations: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashRequest {
    pub file_base64: String,
    pub algorithms: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageProcessRequest {
    pub file_base64: String,
    pub output_format: Option<String>,
    pub operations: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileMagic {
    pub mime: String,
    pub extension: Option<String>,
    pub kind: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub animated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInfo {
    pub archive_type: String,
    pub entries: usize,
    pub total_uncompressed_size: u64,
    pub max_depth: usize,
    pub zip_bomb_risk: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInspectData {
    pub size: usize,
    pub detected_mime: String,
    pub extension: Option<String>,
    pub sha256: String,
    pub magic: FileMagic,
    pub image: Option<ImageInfo>,
    pub archive: Option<ArchiveInfo>,
    pub warnings: Vec<String>,
    pub source: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashData {
    pub size: usize,
    pub hashes: BTreeMap<String, String>,
    pub source: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInspectData {
    pub size: usize,
    pub detected_mime: String,
    pub image: ImageInfo,
    pub source: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageProcessData {
    pub output_format: String,
    pub size: usize,
    pub image_base64: String,
    pub metadata: Value,
    pub source: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInspectData {
    pub size: usize,
    pub archive: ArchiveInfo,
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
