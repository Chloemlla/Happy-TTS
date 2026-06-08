use crate::models::{ArchiveInfo, FileMagic};

const ZIP_LOCAL_FILE_HEADER: &[u8; 4] = b"PK\x03\x04";
const ZIP64_EXTENDED_INFO_EXTRA_ID: u16 = 0x0001;
const ZIP_DATA_DESCRIPTOR_FLAG: u16 = 0x0008;

pub fn inspect_archive(bytes: &[u8], magic: &FileMagic) -> Option<ArchiveInfo> {
    match magic.mime.as_str() {
        "application/zip" => Some(inspect_zip(bytes)),
        "application/gzip" => Some(ArchiveInfo {
            archive_type: "gzip".to_string(),
            entries: 1,
            total_uncompressed_size: 0,
            max_depth: 0,
            zip_bomb_risk: true,
            warnings: vec![
                "gzip uncompressed size is not available from header-only inspection; treating archive size as indeterminate".to_string(),
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
    let mut sizing_indeterminate = false;

    while offset + 30 <= bytes.len() {
        let Some(header_offset) = find_signature(bytes, offset, ZIP_LOCAL_FILE_HEADER) else {
            break;
        };
        offset = header_offset;
        if offset + 30 > bytes.len() {
            break;
        }

        let flags = read_u16_le(&bytes[offset + 6..offset + 8]);
        let compressed_size_32 = read_u32_le(&bytes[offset + 18..offset + 22]);
        let uncompressed_size_32 = read_u32_le(&bytes[offset + 22..offset + 26]);
        let name_length = read_u16_le(&bytes[offset + 26..offset + 28]) as usize;
        let extra_length = read_u16_le(&bytes[offset + 28..offset + 30]) as usize;
        let name_start = offset + 30;
        let name_end = name_start.saturating_add(name_length);
        let extra_start = name_end;
        let extra_end = extra_start.saturating_add(extra_length);
        if extra_end > bytes.len() {
            warnings.push("ZIP local header name or extra field is truncated".to_string());
            sizing_indeterminate = true;
            break;
        }
        let name = String::from_utf8_lossy(&bytes[name_start..name_end]).to_string();
        let extra = &bytes[extra_start..extra_end];
        let uses_data_descriptor = flags & ZIP_DATA_DESCRIPTOR_FLAG != 0;
        let uses_zip64 =
            compressed_size_32 == u32::MAX || uncompressed_size_32 == u32::MAX || has_zip64_extra(extra);

        entries += 1;
        max_depth = max_depth.max(name.matches('/').count());

        if uses_data_descriptor {
            warnings.push(format!(
                "entry {name} uses a data descriptor; treating archive size as indeterminate"
            ));
            sizing_indeterminate = true;
        }

        if uses_zip64 {
            warnings.push(format!(
                "entry {name} uses ZIP64 sizing; treating archive size as indeterminate"
            ));
            sizing_indeterminate = true;
        }

        if !uses_data_descriptor && !uses_zip64 {
            total_uncompressed_size =
                total_uncompressed_size.saturating_add(uncompressed_size_32 as u64);
        }

        let compressed_size = if uses_data_descriptor || uses_zip64 {
            0usize
        } else {
            compressed_size_32 as usize
        };
        let next = extra_end.saturating_add(compressed_size);
        if next <= offset {
            warnings.push("ZIP local header did not advance during inspection".to_string());
            sizing_indeterminate = true;
            break;
        }
        offset = next;
    }

    let zip_bomb_risk = sizing_indeterminate
        || entries > 10_000
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

fn has_zip64_extra(bytes: &[u8]) -> bool {
    let mut offset = 0usize;
    while offset + 4 <= bytes.len() {
        let header_id = read_u16_le(&bytes[offset..offset + 2]);
        let data_size = read_u16_le(&bytes[offset + 2..offset + 4]) as usize;
        let data_start = offset + 4;
        let data_end = data_start.saturating_add(data_size);
        if data_end > bytes.len() {
            return true;
        }
        if header_id == ZIP64_EXTENDED_INFO_EXTRA_ID {
            return true;
        }
        offset = data_end;
    }

    offset != bytes.len()
}
