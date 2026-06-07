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
    config::SecurityWorkerConfig,
    error::AppError,
    models::{
        ContentScanData, ContentScanRequest, EnvelopeDecryptData, EnvelopeDecryptRequest,
        HmacVerifyData, HmacVerifyRequest, PowVerifyData, PowVerifyRequest, RiskScoreData,
        RiskScoreRequest, SuccessEnvelope,
    },
    processing,
};

#[derive(Clone)]
struct AppState {
    config: Arc<SecurityWorkerConfig>,
}

pub fn build_router(config: SecurityWorkerConfig) -> Router {
    let state = AppState {
        config: Arc::new(config),
    };

    Router::new()
        .route("/healthz", get(healthz))
        .route("/v1/security/pow/verify", post(verify_pow))
        .route("/v1/security/hmac/verify", post(verify_hmac))
        .route("/v1/security/envelope/decrypt", post(decrypt_envelope))
        .route("/v1/security/risk/score", post(score_risk))
        .route("/v1/security/content/scan", post(scan_content))
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
        "service": "security-worker",
        "source": "rust-security-worker"
      }
    })))
}

async fn verify_pow(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PowVerifyRequest>,
) -> Result<Json<SuccessEnvelope<PowVerifyData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    let (valid, hash) = processing::verify_pow(&payload.challenge, &payload.nonce, payload.difficulty_bits)?;

    Ok(Json(SuccessEnvelope::ok(PowVerifyData {
        valid,
        hash,
        difficulty_bits: payload.difficulty_bits,
        source: "rust-security-worker",
    })))
}

async fn verify_hmac(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<HmacVerifyRequest>,
) -> Result<Json<SuccessEnvelope<HmacVerifyData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    let algorithm = processing::normalize_hmac_algorithm(payload.algorithm.as_deref().unwrap_or("sha256"))?;
    let valid = processing::verify_hmac(
        &algorithm,
        &payload.key_base64,
        &payload.message_base64,
        &payload.signature_hex,
    )?;

    Ok(Json(SuccessEnvelope::ok(HmacVerifyData {
        valid,
        algorithm,
        source: "rust-security-worker",
    })))
}

async fn decrypt_envelope(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EnvelopeDecryptRequest>,
) -> Result<Json<SuccessEnvelope<EnvelopeDecryptData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    let algorithm = payload.algorithm.unwrap_or_else(|| "aes-256-gcm".to_string());
    let plaintext = processing::decrypt_envelope(
        &algorithm,
        &payload.key_base64,
        &payload.nonce_base64,
        &payload.ciphertext_base64,
        payload.aad_base64.as_deref(),
    )?;

    Ok(Json(SuccessEnvelope::ok(EnvelopeDecryptData {
        plaintext_base64: general_purpose::STANDARD.encode(plaintext),
        algorithm,
        source: "rust-security-worker",
    })))
}

async fn score_risk(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RiskScoreRequest>,
) -> Result<Json<SuccessEnvelope<RiskScoreData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    Ok(Json(SuccessEnvelope::ok(processing::score_risk(
        &payload.signals,
    ))))
}

async fn scan_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ContentScanRequest>,
) -> Result<Json<SuccessEnvelope<ContentScanData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;
    let matches = processing::scan_content(
        &payload.text,
        &payload.rules,
        payload.case_sensitive.unwrap_or(false),
        &state.config,
    )?;

    Ok(Json(SuccessEnvelope::ok(ContentScanData {
        matched: !matches.is_empty(),
        matches,
        source: "rust-security-worker",
    })))
}
