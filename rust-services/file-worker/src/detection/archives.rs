use crate::models::{ArchiveInfo, FileMagic};

const ZIP_LOCAL_FILE_HEADER: &[u8; 4] = b"PK\x03\x04";

pub fn inspect_archive(bytes: &[u8], magic: &FileMagic) -> Option<ArchiveInfo> {
    match magic.mime.as_str() {
        "application/zip" => Some(inspect_zip(bytes)),
        "application/gzip" => Some(ArchiveInfo {
            archive_type: "gzip".to_string(),
            entries: 1,
            total_uncompressed_size: 0,
            max_depth: 0,
            zip_bomb_risk: false,
            warnings: vec![
                "gzip uncompressed size is not available from header-only inspection".to_string(),
            ],
        }),
        _ => None,
    }
}

fn inspect_zip(bytes: &[u8]) -> ArchiveInfo {
    let mut offset = 0usize;
    let mut entries = 0usize;
    let mut total_uncompressed_size = 0u64;
    let mut max_depth = 0usize;
    let mut warnings = Vec::new();

    while offset + 30 <= bytes.len() {
        let Some(header_offset) = find_signature(bytes, offset, ZIP_LOCAL_FILE_HEADER) else {
            break;
        };
        offset = header_offset;
        if offset + 30 > bytes.len() {
            break;
        }

        let compressed_size = read_u32_le(&bytes[offset + 18..offset + 22]) as usize;
        let uncompressed_size = read_u32_le(&bytes[offset + 22..offset + 26]) as u64;
        let name_length = read_u16_le(&bytes[offset + 26..offset + 28]) as usize;
        let extra_length = read_u16_le(&bytes[offset + 28..offset + 30]) as usize;
        let name_start = offset + 30;
        let name_end = name_start.saturating_add(name_length).min(bytes.len());
        let name = String::from_utf8_lossy(&bytes[name_start..name_end]).to_string();

        entries += 1;
        total_uncompressed_size = total_uncompressed_size.saturating_add(uncompressed_size);
        max_depth = max_depth.max(name.matches('/').count());

        if compressed_size == 0 && uncompressed_size > 0 {
            warnings.push(format!(
                "entry {name} uses descriptor or unsupported ZIP64 sizing"
            ));
        }

        let next = name_start
            .saturating_add(name_length)
            .saturating_add(extra_length)
            .saturating_add(compressed_size);
        if next <= offset {
            break;
        }
        offset = next;
    }

    let zip_bomb_risk = entries > 10_000
        || total_uncompressed_size > 500 * 1024 * 1024
        || (bytes.len() > 0 && total_uncompressed_size > (bytes.len() as u64).saturating_mul(100));

    ArchiveInfo {
        archive_type: "zip".to_string(),
        entries,
        total_uncompressed_size,
        max_depth,
        zip_bomb_risk,
        warnings,
    }
}

fn find_signature(bytes: &[u8], start: usize, signature: &[u8]) -> Option<usize> {
    bytes
        .get(start..)?
        .windows(signature.len())
        .position(|window| window == signature)
        .map(|position| start + position)
}

fn read_u16_le(bytes: &[u8]) -> u16 {
    u16::from_le_bytes([bytes[0], bytes[1]])
}

fn read_u32_le(bytes: &[u8]) -> u32 {
    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}
