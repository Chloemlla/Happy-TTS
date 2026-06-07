use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PowVerifyRequest {
    pub challenge: String,
    pub nonce: String,
    pub difficulty_bits: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowVerifyData {
    pub valid: bool,
    pub hash: String,
    pub difficulty_bits: u8,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HmacVerifyRequest {
    pub algorithm: Option<String>,
    pub key_base64: String,
    pub message_base64: String,
    pub signature_hex: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HmacVerifyData {
    pub valid: bool,
    pub algorithm: String,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeDecryptRequest {
    pub algorithm: Option<String>,
    pub key_base64: String,
    pub nonce_base64: String,
    pub ciphertext_base64: String,
    pub aad_base64: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeDecryptData {
    pub plaintext_base64: String,
    pub algorithm: String,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskScoreRequest {
    pub signals: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskScoreData {
    pub score: u8,
    pub reasons: Vec<String>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRule {
    pub id: String,
    pub pattern: String,
    pub severity: Option<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentScanRequest {
    pub text: String,
    pub rules: Vec<ContentRule>,
    pub case_sensitive: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRuleMatch {
    pub rule_id: String,
    pub pattern: String,
    pub severity: u8,
    pub count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentScanData {
    pub matched: bool,
    pub matches: Vec<ContentRuleMatch>,
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
