use serde_json::{json, Value};

use crate::error::AppError;
use crate::models::{FileMagic, ImageInfo};

pub fn inspect_image(bytes: &[u8], magic: &FileMagic) -> Option<ImageInfo> {
    match magic.mime.as_str() {
        "image/png" => inspect_png(bytes),
        "image/jpeg" => inspect_jpeg(bytes),
        "image/gif" => inspect_gif(bytes),
        "image/webp" => inspect_webp(bytes),
        _ => None,
    }
}

pub fn process_image(
    bytes: Vec<u8>,
    output_format: Option<&str>,
    operations: &[String],
) -> Result<(Vec<u8>, String, Value), AppError> {
    let mut processed = bytes;
    let mut applied = Vec::new();
    let mut warnings = Vec::new();
    let output_format = normalize_output_format(output_format)?;

    if operations
        .iter()
        .any(|operation| operation == "exifcleanup" || operation == "stripexif")
    {
        let (cleaned, changed) = strip_jpeg_exif(&processed);
        if changed {
            processed = cleaned;
            applied.push("exifCleanup");
        }
    }

    if operations
        .iter()
        .any(|operation| operation == "compress" || operation == "webp")
    {
        warnings.push("image compression or WebP conversion was not applied because an image encoder backend is not enabled");
    }

    Ok((
        processed,
        output_format,
        json!({
            "operations": operations,
            "appliedOperations": applied,
            "warnings": warnings
        }),
    ))
}

fn normalize_output_format(output_format: Option<&str>) -> Result<String, AppError> {
    let normalized = output_format
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "original".to_string());

    if normalized == "original" {
        return Ok(normalized);
    }

    Err(AppError::BadRequest(
        "image outputFormat conversion is not supported without an encoder backend".to_string(),
    ))
}

fn inspect_png(bytes: &[u8]) -> Option<ImageInfo> {
    if bytes.len() < 24 {
        return None;
    }
    Some(ImageInfo {
        width: u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]),
        height: u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]),
        format: "png".to_string(),
        animated: bytes.windows(4).any(|window| window == b"acTL"),
    })
}

fn inspect_gif(bytes: &[u8]) -> Option<ImageInfo> {
    if bytes.len() < 10 {
        return None;
    }
    Some(ImageInfo {
        width: u16::from_le_bytes([bytes[6], bytes[7]]) as u32,
        height: u16::from_le_bytes([bytes[8], bytes[9]]) as u32,
        format: "gif".to_string(),
        animated: bytes
            .windows(3)
            .filter(|window| *window == b"\x21\xF9\x04")
            .count()
            > 1,
    })
}

fn inspect_jpeg(bytes: &[u8]) -> Option<ImageInfo> {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return None;
    }

    let mut offset = 2usize;
    while offset + 4 < bytes.len() {
        while offset < bytes.len() && bytes[offset] == 0xff {
            offset += 1;
        }
        if offset >= bytes.len() {
            return None;
        }
        let marker = bytes[offset];
        offset += 1;
        if marker == 0xd9 || marker == 0xda {
            return None;
        }
        if offset + 2 > bytes.len() {
            return None;
        }
        let length = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        if length < 2 || offset + length > bytes.len() {
            return None;
        }
        if matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        ) && offset + 7 < bytes.len()
        {
            return Some(ImageInfo {
                height: u16::from_be_bytes([bytes[offset + 3], bytes[offset + 4]]) as u32,
                width: u16::from_be_bytes([bytes[offset + 5], bytes[offset + 6]]) as u32,
                format: "jpeg".to_string(),
                animated: false,
            });
        }
        offset += length;
    }

    None
}

fn inspect_webp(bytes: &[u8]) -> Option<ImageInfo> {
    if bytes.len() < 30 || !bytes.starts_with(b"RIFF") || bytes.get(8..12) != Some(b"WEBP") {
        return None;
    }

    match bytes.get(12..16)? {
        b"VP8X" => Some(ImageInfo {
            width: 1 + read_u24_le(&bytes[24..27]),
            height: 1 + read_u24_le(&bytes[27..30]),
            format: "webp".to_string(),
            animated: bytes[20] & 0b0000_0010 != 0,
        }),
        b"VP8L" if bytes.len() >= 25 && bytes[20] == 0x2f => {
            let b0 = bytes[21] as u32;
            let b1 = bytes[22] as u32;
            let b2 = bytes[23] as u32;
            let b3 = bytes[24] as u32;
            Some(ImageInfo {
                width: 1 + (((b1 & 0x3f) << 8) | b0),
                height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
                format: "webp".to_string(),
                animated: false,
            })
        }
        b"VP8 " if bytes.len() >= 30 => Some(ImageInfo {
            width: (u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3fff) as u32,
            height: (u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3fff) as u32,
            format: "webp".to_string(),
            animated: false,
        }),
        _ => None,
    }
}

fn strip_jpeg_exif(bytes: &[u8]) -> (Vec<u8>, bool) {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return (bytes.to_vec(), false);
    }

    let mut output = bytes[..2].to_vec();
    let mut offset = 2usize;
    let mut changed = false;

    while offset + 4 <= bytes.len() {
        if bytes[offset] != 0xff {
            output.extend_from_slice(&bytes[offset..]);
            return (output, changed);
        }

        let marker = bytes[offset + 1];
        if marker == 0xda {
            output.extend_from_slice(&bytes[offset..]);
            return (output, changed);
        }
        let length = u16::from_be_bytes([bytes[offset + 2], bytes[offset + 3]]) as usize;
        if length < 2 || offset + 2 + length > bytes.len() {
            output.extend_from_slice(&bytes[offset..]);
            return (output, changed);
        }

        let segment_end = offset + 2 + length;
        let is_exif = marker == 0xe1 && bytes.get(offset + 4..offset + 10) == Some(b"Exif\0\0");
        if is_exif {
            changed = true;
        } else {
            output.extend_from_slice(&bytes[offset..segment_end]);
        }
        offset = segment_end;
    }

    if offset < bytes.len() {
        output.extend_from_slice(&bytes[offset..]);
    }

    (output, changed)
}

fn read_u24_le(bytes: &[u8]) -> u32 {
    (bytes[0] as u32) | ((bytes[1] as u32) << 8) | ((bytes[2] as u32) << 16)
}
