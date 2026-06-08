use std::sync::Arc;

use base64::{engine::general_purpose, Engine as _};
use ipc_runtime::IpcRequest;
use serde_json::{json, Value};

use crate::{
    config::SecurityWorkerConfig,
    error::AppError,
    models::{
        ContentScanData, ContentScanRequest, EnvelopeDecryptData, EnvelopeDecryptRequest,
        HmacVerifyData, HmacVerifyRequest, PowVerifyData, PowVerifyRequest, RiskScoreData,
        RiskScoreRequest, SuccessEnvelope,
    },
    processing,
};

pub async fn handle_request(config: Arc<SecurityWorkerConfig>, request: IpcRequest) -> Value {
    if let Err(error) = require_internal_token(&request.token, &config) {
        return error_json(error);
    }

    if request.path == "/healthz" {
        return json!({
          "success": true,
          "data": {
            "status": "ok",
            "service": "security-worker",
            "source": "rust-security-worker"
          }
        });
    }

    if !request.method.eq_ignore_ascii_case("POST") {
        return error_json(AppError::BadRequest("IPC route requires POST".to_string()));
    }

    match request.path.as_str() {
        "/v1/security/pow/verify" => parse_body::<PowVerifyRequest>(request.body)
            .and_then(verify_pow)
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/security/hmac/verify" => parse_body::<HmacVerifyRequest>(request.body)
            .and_then(verify_hmac)
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/security/envelope/decrypt" => parse_body::<EnvelopeDecryptRequest>(request.body)
            .and_then(decrypt_envelope)
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/security/risk/score" => parse_body::<RiskScoreRequest>(request.body)
            .map(score_risk)
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        "/v1/security/content/scan" => parse_body::<ContentScanRequest>(request.body)
            .and_then(|payload| scan_content(&config, payload))
            .map(|data| envelope_json(SuccessEnvelope::ok(data)))
            .unwrap_or_else(error_json),
        _ => error_json(AppError::BadRequest(format!(
            "unknown IPC route {}",
            request.path
        ))),
    }
}

fn verify_pow(payload: PowVerifyRequest) -> Result<PowVerifyData, AppError> {
    let (valid, hash) =
        processing::verify_pow(&payload.challenge, &payload.nonce, payload.difficulty_bits)?;

    Ok(PowVerifyData {
        valid,
        hash,
        difficulty_bits: payload.difficulty_bits,
        source: "rust-security-worker",
    })
}

fn verify_hmac(payload: HmacVerifyRequest) -> Result<HmacVerifyData, AppError> {
    let algorithm =
        processing::normalize_hmac_algorithm(payload.algorithm.as_deref().unwrap_or("sha256"))?;
    let valid = processing::verify_hmac(
        &algorithm,
        &payload.key_base64,
        &payload.message_base64,
        &payload.signature_hex,
    )?;

    Ok(HmacVerifyData {
        valid,
        algorithm,
        source: "rust-security-worker",
    })
}

fn decrypt_envelope(payload: EnvelopeDecryptRequest) -> Result<EnvelopeDecryptData, AppError> {
    let algorithm = payload
        .algorithm
        .unwrap_or_else(|| "aes-256-gcm".to_string());
    let plaintext = processing::decrypt_envelope(
        &algorithm,
        &payload.key_base64,
        &payload.nonce_base64,
        &payload.ciphertext_base64,
        payload.aad_base64.as_deref(),
    )?;

    Ok(EnvelopeDecryptData {
        plaintext_base64: general_purpose::STANDARD.encode(plaintext),
        algorithm,
        source: "rust-security-worker",
    })
}

fn score_risk(payload: RiskScoreRequest) -> RiskScoreData {
    processing::score_risk(&payload.signals)
}

fn scan_content(
    config: &SecurityWorkerConfig,
    payload: ContentScanRequest,
) -> Result<ContentScanData, AppError> {
    let matches = processing::scan_content(
        &payload.text,
        &payload.rules,
        payload.case_sensitive.unwrap_or(false),
        config,
    )?;

    Ok(ContentScanData {
        matched: !matches.is_empty(),
        matches,
        source: "rust-security-worker",
    })
}

fn require_internal_token(token: &str, config: &SecurityWorkerConfig) -> Result<(), AppError> {
    if token.trim().is_empty() {
        return Err(AppError::Unauthorized);
    }
    if token != config.internal_token {
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
