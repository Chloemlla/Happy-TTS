use crate::models::FileMagic;

pub fn detect_magic(bytes: &[u8]) -> FileMagic {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return magic("image/png", Some("png"), "image");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return magic("image/jpeg", Some("jpg"), "image");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return magic("image/gif", Some("gif"), "image");
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return magic("image/webp", Some("webp"), "image");
    }
    if bytes.starts_with(b"%PDF-") {
        return magic("application/pdf", Some("pdf"), "document");
    }
    if bytes.starts_with(b"PK\x03\x04")
        || bytes.starts_with(b"PK\x05\x06")
        || bytes.starts_with(b"PK\x07\x08")
    {
        return magic("application/zip", Some("zip"), "archive");
    }
    if bytes.starts_with(&[0x1f, 0x8b]) {
        return magic("application/gzip", Some("gz"), "archive");
    }
    if bytes.starts_with(b"ID3")
        || bytes
            .windows(2)
            .any(|window| window[0] == 0xff && (window[1] & 0xe0) == 0xe0)
    {
        return magic("audio/mpeg", Some("mp3"), "audio");
    }
    if bytes.starts_with(b"fLaC") {
        return magic("audio/flac", Some("flac"), "audio");
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") {
        return magic("audio/wav", Some("wav"), "audio");
    }
    if bytes.starts_with(b"OggS") {
        return magic("application/ogg", Some("ogg"), "audio");
    }
    if looks_like_json(bytes) {
        return magic("application/json", Some("json"), "text");
    }
    if looks_like_utf8(bytes) {
        return magic("text/plain", Some("txt"), "text");
    }

    magic("application/octet-stream", None, "binary")
}

fn magic(mime: &str, extension: Option<&str>, kind: &str) -> FileMagic {
    FileMagic {
        mime: mime.to_string(),
        extension: extension.map(|extension| extension.to_string()),
        kind: kind.to_string(),
    }
}

fn looks_like_json(bytes: &[u8]) -> bool {
    let trimmed = trim_ascii_whitespace(bytes);
    (trimmed.starts_with(b"{") && trimmed.ends_with(b"}"))
        || (trimmed.starts_with(b"[") && trimmed.ends_with(b"]"))
}

fn looks_like_utf8(bytes: &[u8]) -> bool {
    std::str::from_utf8(bytes).is_ok()
        && !bytes
            .iter()
            .any(|value| value.is_ascii_control() && !matches!(value, b'\n' | b'\r' | b'\t'))
}

fn trim_ascii_whitespace(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|value| !value.is_ascii_whitespace())
        .unwrap_or(bytes.len());
    let end = bytes
        .iter()
        .rposition(|value| !value.is_ascii_whitespace())
        .map(|index| index + 1)
        .unwrap_or(start);
    &bytes[start..end]
}
