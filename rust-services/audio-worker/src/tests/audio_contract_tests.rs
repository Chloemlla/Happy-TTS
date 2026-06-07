use base64::{engine::general_purpose, Engine as _};

use crate::processing::{
    analyze::analyze_audio, normalize_operations, normalize_output_format, process_audio_bytes,
    validate_content_hash, validate_task_id,
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
    assert!(normalize_operations(Some(&["unsupported".to_string()])).is_err());
    assert_eq!(
        normalize_operations(Some(&[
            "validateMagic".to_string(),
            "metadataCleanup".to_string(),
            "normalize".to_string()
        ]))
        .unwrap(),
        vec![
            "validatemagic".to_string(),
            "metadatacleanup".to_string(),
            "normalize".to_string()
        ]
    );
}

#[test]
fn detects_common_audio_formats() {
    assert_eq!(analyze_audio(b"ID3abc", "mp3").detected_format, "mp3");
    assert_eq!(analyze_audio(b"RIFFxxxxWAVE", "wav").detected_format, "wav");
    assert_eq!(analyze_audio(b"fLaCabc", "flac").detected_format, "flac");
}

#[test]
fn validates_magic_bytes_when_requested() {
    let result = process_audio_bytes(
        b"not-an-mp3".to_vec(),
        "mp3",
        &["validatemagic".to_string()],
    );
    assert!(result.is_err());
}

#[test]
fn strips_mp3_id3_metadata_when_requested() {
    let mut audio = b"ID3\x04\0\0\0\0\0\0".to_vec();
    audio.extend_from_slice(&[0xff, 0xfb, 0x90, 0x64, 0x00]);

    let processed = process_audio_bytes(
        audio,
        "mp3",
        &["metadatacleanup".to_string(), "analyze".to_string()],
    )
    .unwrap();

    assert!(processed.bytes.starts_with(&[0xff, 0xfb]));
    assert_eq!(processed.metadata["detectedFormat"], "mp3");
}

#[test]
fn base64_contract_roundtrips_audio_bytes() {
    let original = b"audio-bytes";
    let encoded = general_purpose::STANDARD.encode(original);
    let decoded = general_purpose::STANDARD.decode(encoded).unwrap();
    assert_eq!(decoded, original);
}
