use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct AudioAnalysis {
    pub detected_format: String,
    pub duration_ms: Option<u64>,
    pub bitrate_kbps: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub bits_per_sample: Option<u8>,
    pub magic_valid: bool,
}

impl AudioAnalysis {
    pub fn to_metadata(&self) -> Value {
        json!({
            "detectedFormat": self.detected_format,
            "durationMs": self.duration_ms,
            "bitrateKbps": self.bitrate_kbps,
            "sampleRate": self.sample_rate,
            "channels": self.channels,
            "bitsPerSample": self.bits_per_sample,
            "magicValid": self.magic_valid
        })
    }
}

pub fn analyze_audio(bytes: &[u8], declared_format: &str) -> AudioAnalysis {
    let detected_format = detect_format(bytes);
    let magic_valid = detected_format
        .as_deref()
        .map(|detected_format| format_matches_declared(detected_format, declared_format))
        .unwrap_or(false);
    let detected_format = detected_format.unwrap_or_else(|| "unknown".to_string());
    let mut analysis = AudioAnalysis {
        detected_format: detected_format.clone(),
        duration_ms: None,
        bitrate_kbps: None,
        sample_rate: None,
        channels: None,
        bits_per_sample: None,
        magic_valid,
    };

    match detected_format.as_str() {
        "wav" => apply_wav_analysis(bytes, &mut analysis),
        "flac" => apply_flac_analysis(bytes, &mut analysis),
        "mp3" => apply_mp3_analysis(bytes, &mut analysis),
        "opus" => apply_opus_analysis(bytes, &mut analysis),
        _ => {}
    }

    analysis
}

pub fn detect_format(bytes: &[u8]) -> Option<String> {
    if bytes.starts_with(b"ID3") || find_mp3_frame(bytes).is_some() {
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
    if bytes.starts_with(&[0xff, 0xf1]) || bytes.starts_with(&[0xff, 0xf9]) {
        return Some("aac".to_string());
    }
    None
}

pub fn strip_id3v2_metadata(bytes: &[u8]) -> (Vec<u8>, bool) {
    if !bytes.starts_with(b"ID3") || bytes.len() < 10 {
        return (bytes.to_vec(), false);
    }

    let size = synchsafe_u32(&bytes[6..10]) as usize;
    let total = 10usize.saturating_add(size);
    if total >= bytes.len() {
        return (bytes.to_vec(), false);
    }

    (bytes[total..].to_vec(), true)
}

fn format_matches_declared(detected_format: &str, declared_format: &str) -> bool {
    let declared = declared_format.trim().to_ascii_lowercase();
    detected_format == declared || (declared == "pcm" && detected_format == "wav")
}

fn apply_wav_analysis(bytes: &[u8], analysis: &mut AudioAnalysis) {
    let mut offset = 12usize;
    let mut byte_rate = None;
    let mut data_size = None;

    while offset + 8 <= bytes.len() {
        let chunk_id = &bytes[offset..offset + 4];
        let chunk_size = u32::from_le_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        let data_start = offset + 8;
        let data_end = data_start.saturating_add(chunk_size).min(bytes.len());

        if chunk_id == b"fmt " && data_start + 16 <= data_end {
            analysis.channels =
                Some(u16::from_le_bytes([bytes[data_start + 2], bytes[data_start + 3]]) as u8);
            analysis.sample_rate = Some(u32::from_le_bytes([
                bytes[data_start + 4],
                bytes[data_start + 5],
                bytes[data_start + 6],
                bytes[data_start + 7],
            ]));
            byte_rate = Some(u32::from_le_bytes([
                bytes[data_start + 8],
                bytes[data_start + 9],
                bytes[data_start + 10],
                bytes[data_start + 11],
            ]));
            analysis.bits_per_sample =
                Some(u16::from_le_bytes([bytes[data_start + 14], bytes[data_start + 15]]) as u8);
        } else if chunk_id == b"data" {
            data_size = Some(chunk_size as u64);
        }

        offset = data_start.saturating_add(chunk_size + (chunk_size % 2));
    }

    if let (Some(byte_rate), Some(data_size)) = (byte_rate, data_size) {
        if byte_rate > 0 {
            analysis.duration_ms = Some((data_size * 1000) / byte_rate as u64);
            analysis.bitrate_kbps = Some((byte_rate * 8) / 1000);
        }
    }
}

fn apply_flac_analysis(bytes: &[u8], analysis: &mut AudioAnalysis) {
    if bytes.len() < 42 || bytes.get(4).map(|value| value & 0x7f) != Some(0) {
        return;
    }

    let streaminfo = &bytes[8..42];
    let sample_rate = ((streaminfo[10] as u32) << 12)
        | ((streaminfo[11] as u32) << 4)
        | ((streaminfo[12] as u32 & 0xf0) >> 4);
    let channels = ((streaminfo[12] & 0x0e) >> 1) + 1;
    let bits_per_sample = (((streaminfo[12] & 0x01) << 4) | ((streaminfo[13] & 0xf0) >> 4)) + 1;
    let total_samples = ((streaminfo[13] as u64 & 0x0f) << 32)
        | ((streaminfo[14] as u64) << 24)
        | ((streaminfo[15] as u64) << 16)
        | ((streaminfo[16] as u64) << 8)
        | streaminfo[17] as u64;

    analysis.sample_rate = Some(sample_rate);
    analysis.channels = Some(channels);
    analysis.bits_per_sample = Some(bits_per_sample);
    if sample_rate > 0 && total_samples > 0 {
        analysis.duration_ms = Some((total_samples * 1000) / sample_rate as u64);
    }
}

fn apply_mp3_analysis(bytes: &[u8], analysis: &mut AudioAnalysis) {
    let Some(offset) = find_mp3_frame(bytes) else {
        return;
    };
    if offset + 4 > bytes.len() {
        return;
    }

    let header = u32::from_be_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ]);
    let version_id = (header >> 19) & 0b11;
    let layer = (header >> 17) & 0b11;
    let bitrate_index = ((header >> 12) & 0b1111) as usize;
    let sample_rate_index = ((header >> 10) & 0b11) as usize;
    let channel_mode = (header >> 6) & 0b11;

    let bitrate = mp3_bitrate_kbps(version_id, layer, bitrate_index);
    let sample_rate = mp3_sample_rate(version_id, sample_rate_index);
    analysis.bitrate_kbps = bitrate;
    analysis.sample_rate = sample_rate;
    analysis.channels = Some(if channel_mode == 0b11 { 1 } else { 2 });

    if let Some(bitrate) = bitrate {
        if bitrate > 0 {
            let audio_bytes = bytes.len().saturating_sub(offset) as u64;
            analysis.duration_ms = Some((audio_bytes * 8) / bitrate as u64);
        }
    }
}

fn apply_opus_analysis(bytes: &[u8], analysis: &mut AudioAnalysis) {
    if let Some(position) = bytes.windows(8).position(|window| window == b"OpusHead") {
        if position + 10 <= bytes.len() {
            analysis.channels = Some(bytes[position + 9]);
        }
    }
}

fn find_mp3_frame(bytes: &[u8]) -> Option<usize> {
    let start = if bytes.starts_with(b"ID3") && bytes.len() >= 10 {
        10usize.saturating_add(synchsafe_u32(&bytes[6..10]) as usize)
    } else {
        0
    };

    bytes
        .windows(2)
        .enumerate()
        .skip(start)
        .find(|(_, window)| window[0] == 0xff && (window[1] & 0xe0) == 0xe0)
        .map(|(index, _)| index)
}

fn synchsafe_u32(bytes: &[u8]) -> u32 {
    ((bytes[0] as u32 & 0x7f) << 21)
        | ((bytes[1] as u32 & 0x7f) << 14)
        | ((bytes[2] as u32 & 0x7f) << 7)
        | (bytes[3] as u32 & 0x7f)
}

fn mp3_bitrate_kbps(version_id: u32, layer: u32, index: usize) -> Option<u32> {
    if index == 0 || index == 15 || layer == 0 || version_id == 1 {
        return None;
    }

    let table = match (version_id, layer) {
        (3, 3) => [
            0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0,
        ],
        (3, 2) => [
            0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0,
        ],
        (3, 1) => [
            0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
        ],
        (_, 3) => [
            0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0,
        ],
        (_, _) => [
            0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
        ],
    };

    Some(table[index])
}

fn mp3_sample_rate(version_id: u32, index: usize) -> Option<u32> {
    if index == 3 {
        return None;
    }

    let table = match version_id {
        3 => [44100, 48000, 32000],
        2 => [22050, 24000, 16000],
        0 => [11025, 12000, 8000],
        _ => return None,
    };

    Some(table[index])
}
