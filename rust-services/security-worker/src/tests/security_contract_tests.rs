use serde_json::json;
use sha2::{Digest, Sha256};

use crate::{
    config::SecurityWorkerConfig,
    processing::{self, scan_content, score_risk},
    models::ContentRule,
};

fn leading_zero_bits(bytes: &[u8]) -> u8 {
    let mut count = 0u8;
    for byte in bytes {
        if *byte == 0 {
            count = count.saturating_add(8);
            continue;
        }

        for bit in (0..8).rev() {
            if byte & (1 << bit) == 0 {
                count = count.saturating_add(1);
            } else {
                return count;
            }
        }
    }
    count
}

fn solve_pow(challenge: &str, difficulty_bits: u8) -> String {
    for attempt in 0..100_000u64 {
        let nonce = attempt.to_string();
        let hash = Sha256::digest(format!("{challenge}:{nonce}").as_bytes());
        if leading_zero_bits(&hash) >= difficulty_bits {
            return nonce;
        }
    }

    panic!("failed to solve test PoW");
}

#[test]
fn verifies_pow_solution() {
    let challenge = "test-challenge";
    let difficulty_bits = 8;
    let nonce = solve_pow(challenge, difficulty_bits);
    let (valid, hash) = processing::verify_pow(challenge, &nonce, difficulty_bits).unwrap();

    assert!(valid);
    assert_eq!(hash.len(), 64);
}

#[test]
fn scores_risk_from_raw_signals() {
    let scored = score_risk(&json!({
        "tor": true,
        "vpn": true,
        "failedLoginCount": 7,
        "requestRatePerMinute": 140,
        "userAgent": "",
        "newDevice": true,
        "newLocation": true
    }));

    assert_eq!(scored.score, 100);
    assert!(scored.reasons.contains(&"tor=true".to_string()));
    assert!(scored
        .reasons
        .contains(&"requestRatePerMinute>=120".to_string()));
}

#[test]
fn scans_content_rules_with_limits() {
    let config = SecurityWorkerConfig {
        bind_addr: "127.0.0.1:4050".to_string(),
        internal_token: "test-token".to_string(),
        max_text_bytes: 1024,
        max_rules: 8,
    };
    let rules = vec![ContentRule {
        id: "blocked-word".to_string(),
        pattern: "Secret".to_string(),
        severity: Some(7),
    }];

    let matches = scan_content("secret token and another secret", &rules, false, &config).unwrap();

    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].rule_id, "blocked-word");
    assert_eq!(matches[0].severity, 7);
    assert_eq!(matches[0].count, 2);
}
