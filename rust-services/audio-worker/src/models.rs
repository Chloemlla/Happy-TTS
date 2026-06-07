use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProcessRequest {
    pub audio_base64: String,
    pub output_format: String,
    pub task_id: Option<String>,
    pub content_hash: String,
    pub operations: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoudnessSummary {
    pub integrated_lufs: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProcessData {
    pub output_format: String,
    pub duration_ms: Option<u64>,
    pub size: usize,
    pub loudness: Option<LoudnessSummary>,
    pub audio_base64: String,
    pub metadata: Value,
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
