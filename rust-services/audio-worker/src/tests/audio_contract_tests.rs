use base64::{engine::general_purpose, Engine as _};

use crate::processing::{
    analyze::analyze_audio, normalize_operations, normalize_output_format, validate_content_hash,
    validate_task_id,
};

#[test]
fn accepts_supported_output_formats() {
    assert_eq!(normalize_output_format("MP3").unwrap(), "mp3");
    assert_eq!(normalize_output_format("wav").unwrap(), "wav");
}

#[test]
fn rejects_unsupported_output_formats() {
    assert!(normalize_output_format("exe").is_err());
}

#[test]
fn validates_content_hash_and_task_id() {
    assert!(validate_content_hash("abc123").is_ok());
    assert!(validate_content_hash("").is_err());
    assert!(validate_task_id(Some("tts_123")).is_ok());
    assert!(validate_task_id(Some("bad task")).is_err());
}

#[test]
fn defaults_to_passthrough_and_analyze_operations() {
    assert_eq!(
        normalize_operations(None).unwrap(),
        vec!["passthrough".to_string(), "analyze".to_string()]
    );
}

#[test]
fn rejects_unsupported_operations() {
    assert!(normalize_operations(Some(&["normalize".to_string()])).is_err());
}

#[test]
fn detects_common_audio_formats() {
    assert_eq!(analyze_audio(b"ID3abc", "mp3").detected_format, "mp3");
    assert_eq!(analyze_audio(b"RIFFxxxxWAVE", "wav").detected_format, "wav");
    assert_eq!(analyze_audio(b"fLaCabc", "flac").detected_format, "flac");
}

#[test]
fn base64_contract_roundtrips_audio_bytes() {
    let original = b"audio-bytes";
    let encoded = general_purpose::STANDARD.encode(original);
    let decoded = general_purpose::STANDARD.decode(encoded).unwrap();
    assert_eq!(decoded, original);
}
