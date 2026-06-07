use crate::detection::{
    archives, hashes, images, mime, validate_declared_mime, validate_file_name,
};

#[test]
fn detects_png_magic_and_dimensions() {
    let png = minimal_png(320, 200);
    let magic = mime::detect_magic(&png);
    let image = images::inspect_image(&png, &magic).unwrap();

    assert_eq!(magic.mime, "image/png");
    assert_eq!(image.width, 320);
    assert_eq!(image.height, 200);
}

#[test]
fn calculates_sha256_hashes() {
    let hash = hashes::sha256_hex(b"hello");
    assert_eq!(
        hash,
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
}

#[test]
fn validates_names_and_declared_mime() {
    assert!(validate_file_name(Some("avatar.png")).is_ok());
    assert!(validate_file_name(Some("../avatar.png")).is_err());
    assert_eq!(
        validate_declared_mime(Some(" Image/PNG ")).unwrap(),
        Some("image/png".to_string())
    );
    assert!(validate_declared_mime(Some("not-a-mime")).is_err());
}

#[test]
fn strips_jpeg_exif_metadata_when_requested() {
    let jpeg = vec![
        0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, b'E', b'x', b'i', b'f', 0x00, 0x00, 0xff, 0xda, 0x00,
        0x02, 0x01,
    ];
    let (processed, _format, metadata) =
        images::process_image(jpeg, None, &["exifcleanup".to_string()]);

    assert!(!processed.windows(6).any(|window| window == b"Exif\0\0"));
    assert_eq!(metadata["appliedOperations"][0], "exifCleanup");
}

#[test]
fn inspects_zip_headers() {
    let zip = minimal_zip_entry("a/b.txt", 3, 10);
    let magic = mime::detect_magic(&zip);
    let archive = archives::inspect_archive(&zip, &magic).unwrap();

    assert_eq!(archive.archive_type, "zip");
    assert_eq!(archive.entries, 1);
    assert_eq!(archive.total_uncompressed_size, 10);
    assert_eq!(archive.max_depth, 1);
}

fn minimal_png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    bytes.extend_from_slice(&13u32.to_be_bytes());
    bytes.extend_from_slice(b"IHDR");
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&[8, 2, 0, 0, 0]);
    bytes.extend_from_slice(&0u32.to_be_bytes());
    bytes
}

fn minimal_zip_entry(name: &str, compressed_size: u32, uncompressed_size: u32) -> Vec<u8> {
    let name_bytes = name.as_bytes();
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"PK\x03\x04");
    bytes.extend_from_slice(&[20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&compressed_size.to_le_bytes());
    bytes.extend_from_slice(&uncompressed_size.to_le_bytes());
    bytes.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(name_bytes);
    bytes.extend(vec![0u8; compressed_size as usize]);
    bytes
}
