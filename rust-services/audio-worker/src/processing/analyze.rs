#[derive(Debug, Clone)]
pub struct AudioAnalysis {
    pub detected_format: String,
    pub duration_ms: Option<u64>,
}

pub fn analyze_audio(bytes: &[u8], declared_format: &str) -> AudioAnalysis {
    AudioAnalysis {
        detected_format: detect_format(bytes).unwrap_or_else(|| declared_format.to_string()),
        duration_ms: None,
    }
}

fn detect_format(bytes: &[u8]) -> Option<String> {
    if bytes.starts_with(b"ID3") || bytes.first().copied() == Some(0xff) {
        return Some("mp3".to_string());
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") {
        return Some("wav".to_string());
    }
    if bytes.starts_with(b"fLaC") {
        return Some("flac".to_string());
    }
    if bytes.starts_with(b"OggS") {
        return Some("opus".to_string());
    }
    None
}
