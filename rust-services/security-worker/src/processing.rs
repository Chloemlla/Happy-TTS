use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::{Digest, Sha256, Sha512};

use crate::{
    config::SecurityWorkerConfig,
    error::AppError,
    models::{ContentRule, ContentRuleMatch, RiskScoreData},
};

type HmacSha256 = Hmac<Sha256>;
type HmacSha512 = Hmac<Sha512>;

pub fn verify_pow(
    challenge: &str,
    nonce: &str,
    difficulty_bits: u8,
) -> Result<(bool, String), AppError> {
    if challenge.is_empty() || challenge.len() > 512 || nonce.is_empty() || nonce.len() > 256 {
        return Err(AppError::BadRequest(
            "challenge or nonce is invalid".to_string(),
        ));
    }
    if difficulty_bits > 64 {
        return Err(AppError::BadRequest(
            "difficultyBits cannot exceed 64".to_string(),
        ));
    }
    let hash = Sha256::digest(format!("{challenge}:{nonce}").as_bytes());
    let valid = has_leading_zero_bits(&hash, difficulty_bits);
    Ok((valid, hex(&hash)))
}

pub fn verify_hmac(
    algorithm: &str,
    key_base64: &str,
    message_base64: &str,
    signature_hex: &str,
    max_payload_bytes: usize,
) -> Result<bool, AppError> {
    let key = decode_base64_limited(key_base64, "keyBase64", max_payload_bytes)?;
    let message = decode_base64_limited(message_base64, "messageBase64", max_payload_bytes)?;
    let signature = decode_hex(signature_hex)?;
    match normalize_hmac_algorithm(algorithm)?.as_str() {
        "sha256" => {
            let mut mac = <HmacSha256 as Mac>::new_from_slice(&key)
                .map_err(|_| AppError::BadRequest("HMAC key is invalid".to_string()))?;
            mac.update(&message);
            Ok(mac.verify_slice(&signature).is_ok())
        }
        "sha512" => {
            let mut mac = <HmacSha512 as Mac>::new_from_slice(&key)
                .map_err(|_| AppError::BadRequest("HMAC key is invalid".to_string()))?;
            mac.update(&message);
            Ok(mac.verify_slice(&signature).is_ok())
        }
        _ => Err(AppError::BadRequest(
            "unsupported HMAC algorithm".to_string(),
        )),
    }
}

pub fn normalize_hmac_algorithm(algorithm: &str) -> Result<String, AppError> {
    let normalized = algorithm.trim().to_ascii_lowercase();
    if normalized == "sha256" || normalized == "sha512" {
        Ok(normalized)
    } else {
        Err(AppError::BadRequest(format!(
            "unsupported HMAC algorithm: {algorithm}"
        )))
    }
}

pub fn decrypt_envelope(
    algorithm: &str,
    key_base64: &str,
    nonce_base64: &str,
    ciphertext_base64: &str,
    aad_base64: Option<&str>,
    max_payload_bytes: usize,
) -> Result<Vec<u8>, AppError> {
    let normalized = algorithm.trim().to_ascii_lowercase();
    if normalized != "aes-256-gcm" {
        return Err(AppError::BadRequest(format!(
            "unsupported envelope algorithm: {algorithm}"
        )));
    }
    let key = decode_base64_limited(key_base64, "keyBase64", max_payload_bytes)?;
    if key.len() != 32 {
        return Err(AppError::BadRequest(
            "AES-256-GCM key must be 32 bytes".to_string(),
        ));
    }
    let nonce = decode_base64_limited(nonce_base64, "nonceBase64", max_payload_bytes)?;
    if nonce.len() != 12 {
        return Err(AppError::BadRequest(
            "AES-GCM nonce must be 12 bytes".to_string(),
        ));
    }
    let ciphertext = decode_base64_limited(ciphertext_base64, "ciphertextBase64", max_payload_bytes)?;
    let aad = match aad_base64 {
        Some(value) => decode_base64_limited(value, "aadBase64", max_payload_bytes)?,
        None => Vec::new(),
    };
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| AppError::BadRequest("AES key is invalid".to_string()))?;
    cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &ciphertext,
                aad: &aad,
            },
        )
        .map_err(|_| AppError::BadRequest("envelope decrypt failed".to_string()))
}

pub fn score_risk(signals: &Value) -> RiskScoreData {
    let mut score = 0u8;
    let mut reasons = Vec::new();

    if get_bool(signals, "tor").unwrap_or(false) {
        add_score(&mut score, 30, &mut reasons, "tor=true");
    }
    if get_bool(signals, "vpn").unwrap_or(false) {
        add_score(&mut score, 20, &mut reasons, "vpn=true");
    }
    if get_number(signals, "failedLoginCount").unwrap_or(0.0) >= 5.0 {
        add_score(&mut score, 25, &mut reasons, "failedLoginCount>=5");
    }
    if get_number(signals, "requestRatePerMinute").unwrap_or(0.0) >= 120.0 {
        add_score(&mut score, 20, &mut reasons, "requestRatePerMinute>=120");
    }
    if get_string(signals, "userAgent")
        .map(|value| value.trim().is_empty() || value.len() < 8)
        .unwrap_or(false)
    {
        add_score(&mut score, 10, &mut reasons, "weakUserAgent");
    }
    if get_bool(signals, "newDevice").unwrap_or(false)
        && get_bool(signals, "newLocation").unwrap_or(false)
    {
        add_score(&mut score, 15, &mut reasons, "newDeviceAndLocation");
    }

    RiskScoreData {
        score,
        reasons,
        source: "rust-security-worker",
    }
}

pub fn scan_content(
    text: &str,
    rules: &[ContentRule],
    case_sensitive: bool,
    config: &SecurityWorkerConfig,
) -> Result<Vec<ContentRuleMatch>, AppError> {
    if text.len() > config.max_text_bytes {
        return Err(AppError::BadRequest(format!(
            "text cannot exceed {} bytes",
            config.max_text_bytes
        )));
    }
    if rules.len() > config.max_rules {
        return Err(AppError::BadRequest(format!(
            "rules cannot contain more than {}",
            config.max_rules
        )));
    }

    let haystack = if case_sensitive {
        text.to_string()
    } else {
        text.to_ascii_lowercase()
    };
    let mut matches = Vec::new();
    for rule in rules {
        if rule.id.trim().is_empty() || rule.pattern.trim().is_empty() {
            return Err(AppError::BadRequest(
                "content scan rule id and pattern are required".to_string(),
            ));
        }
        let needle = if case_sensitive {
            rule.pattern.clone()
        } else {
            rule.pattern.to_ascii_lowercase()
        };
        let count = haystack.matches(&needle).count();
        if count > 0 {
            matches.push(ContentRuleMatch {
                rule_id: rule.id.clone(),
                pattern: rule.pattern.clone(),
                severity: rule.severity.unwrap_or(1).min(10),
                count,
            });
        }
    }

    Ok(matches)
}

fn add_score(score: &mut u8, delta: u8, reasons: &mut Vec<String>, reason: &str) {
    *score = score.saturating_add(delta).min(100);
    reasons.push(reason.to_string());
}

fn get_bool(value: &Value, key: &str) -> Option<bool> {
    value.get(key)?.as_bool()
}

fn get_number(value: &Value, key: &str) -> Option<f64> {
    value.get(key)?.as_f64()
}

fn get_string<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key)?.as_str()
}

fn has_leading_zero_bits(bytes: &[u8], bits: u8) -> bool {
    let full_bytes = (bits / 8) as usize;
    let remaining_bits = bits % 8;
    if bytes.iter().take(full_bytes).any(|byte| *byte != 0) {
        return false;
    }
    if remaining_bits == 0 {
        return true;
    }
    let Some(next) = bytes.get(full_bytes) else {
        return false;
    };
    next >> (8 - remaining_bits) == 0
}

fn decode_base64_limited(value: &str, field: &str, max_bytes: usize) -> Result<Vec<u8>, AppError> {
    if decoded_base64_upper_bound(value) > max_bytes {
        return Err(AppError::BadRequest(format!(
            "{field} decoded payload cannot exceed {max_bytes} bytes"
        )));
    }

    let decoded = general_purpose::STANDARD
        .decode(value.as_bytes())
        .map_err(|_| AppError::BadRequest(format!("{field} must be valid base64")))?;
    if decoded.len() > max_bytes {
        return Err(AppError::BadRequest(format!(
            "{field} decoded payload cannot exceed {max_bytes} bytes"
        )));
    }
    Ok(decoded)
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

fn decode_hex(value: &str) -> Result<Vec<u8>, AppError> {
    let normalized = value.trim();
    if normalized.len() % 2 != 0 {
        return Err(AppError::BadRequest(
            "signatureHex must have an even length".to_string(),
        ));
    }
    normalized
        .as_bytes()
        .chunks_exact(2)
        .map(|chunk| {
            let high = hex_value(chunk[0])?;
            let low = hex_value(chunk[1])?;
            Ok((high << 4) | low)
        })
        .collect()
}

fn hex_value(value: u8) -> Result<u8, AppError> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err(AppError::BadRequest(
            "signatureHex must be valid hex".to_string(),
        )),
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
