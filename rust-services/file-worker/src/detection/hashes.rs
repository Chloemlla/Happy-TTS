use std::collections::BTreeMap;

use sha2::{Digest, Sha256, Sha512};

use crate::error::AppError;

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

pub fn calculate_hashes(
    bytes: &[u8],
    algorithms: Option<&[String]>,
) -> Result<BTreeMap<String, String>, AppError> {
    let requested = algorithms
        .filter(|algorithms| !algorithms.is_empty())
        .map(|algorithms| {
            algorithms
                .iter()
                .map(|algorithm| algorithm.trim().to_ascii_lowercase())
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec!["sha256".to_string()]);

    let mut hashes = BTreeMap::new();
    for algorithm in requested {
        match algorithm.as_str() {
            "sha256" => {
                hashes.insert("sha256".to_string(), sha256_hex(bytes));
            }
            "sha512" => {
                hashes.insert("sha512".to_string(), hex(&Sha512::digest(bytes)));
            }
            _ => {
                return Err(AppError::BadRequest(format!(
                    "unsupported hash algorithm: {algorithm}"
                )));
            }
        }
    }

    Ok(hashes)
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
