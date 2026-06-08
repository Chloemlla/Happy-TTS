use base64::{engine::general_purpose, Engine as _};

use crate::{config::DataToolsConfig, processing};

fn test_config() -> DataToolsConfig {
    DataToolsConfig {
        bind_addr: "127.0.0.1:4040".to_string(),
        internal_token: "test-token".to_string(),
        max_bytes: 1024 * 1024,
        max_items: 10,
    }
}

#[test]
fn hashes_and_base64_batches() {
    assert_eq!(
        processing::hash_text("hello", "sha256").unwrap(),
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    assert_eq!(
        processing::base64_transform("hello", "encode").unwrap(),
        "aGVsbG8="
    );
    assert_eq!(
        processing::base64_transform("aGVsbG8=", "decode").unwrap(),
        "hello"
    );
}

#[test]
fn converts_utf8_to_utf16le() {
    let input = general_purpose::STANDARD.encode("hi".as_bytes());
    let converted =
        processing::convert_encoding(&input, "utf-8", "utf-16le", &test_config()).unwrap();
    assert_eq!(converted, vec![b'h', 0, b'i', 0]);
}

#[test]
fn inspects_csv_and_json() {
    let csv = processing::inspect_csv("name,age\nalice,1\nbob,2", Some(","), true, 10).unwrap();
    assert_eq!(csv.rows, 3);
    assert_eq!(csv.columns, 2);
    assert!(csv.consistent_columns);

    let json = processing::inspect_json(r#"{"a":[1,2]}"#);
    assert!(json.valid);
    assert_eq!(json.root_type, "object");
    assert!(json.depth >= 2);
}

#[test]
fn compresses_and_decompresses_gzip() {
    let input = general_purpose::STANDARD.encode(b"hello hello hello");
    let compressed = processing::compress(&input, "gzip", &test_config()).unwrap();
    let compressed_base64 = general_purpose::STANDARD.encode(compressed);
    let decompressed = processing::decompress(&compressed_base64, "gzip", &test_config()).unwrap();
    assert_eq!(decompressed, b"hello hello hello");
}
