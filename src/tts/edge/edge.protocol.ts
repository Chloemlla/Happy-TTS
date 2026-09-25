import crypto from "node:crypto";

/**
 * 微软 Edge「朗读」接口的协议常量。
 * 取值来源：aitts-rev/decompiled/TTS.Base/TTS.Base.TTS.Edge/{Constants,Drm,Communicate}.cs
 * 这些值等同于 Edge 浏览器自带朗读功能所用的公开客户端参数，不属于本项目的机密。
 */

export const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
export const EDGE_SEC_MS_GEC_VERSION = "1-143.0.3650.75";
export const EDGE_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
export const EDGE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
export const EDGE_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

/** 朗读服务的音频格式：24kHz / 48kbps / 单声道 MP3。 */
export const EDGE_AUDIO_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
export const EDGE_AUDIO_CONTENT_TYPE = "audio/mpeg";

/**
 * 单轮 SSML 的字符上限。上游对超长单轮会提前断流（约 10 分钟音频量级），
 * 因此长文本先按标点切块再逐块合成，块与块之间拼接 MP3 帧。
 */
export const EDGE_MAX_CHUNK_CHARS = 1500;
export const EDGE_SYNTHESIS_TIMEOUT_MS = 45_000;
export const EDGE_VOICE_LIST_TIMEOUT_MS = 20_000;
export const EDGE_MAX_HANDSHAKE_ATTEMPTS = 3;

/** 结尾标点：优先在这些位置切块，尽量让每块是一个完整句子。 */
const EDGE_SENTENCE_BOUNDARY_PATTERN = /[。！？!?；;…\n]/;
const EDGE_CLAUSE_BOUNDARY_PATTERN = /[,，、:：]/;

const EDGE_DATE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EDGE_DATE_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * 上游音色 ID 的形状：<语言>-<地区>[-<变体>]-<名称>Neural。
 * 已用上游全量 322 条音色列表逐一核对通过；用于把 OpenAI 风格的音色名挡在门外。
 */
const EDGE_VOICE_ID_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})+-[A-Za-z0-9]{1,32}Neural$/;

export function isEdgeVoiceId(value: unknown): value is string {
  return typeof value === "string" && EDGE_VOICE_ID_PATTERN.test(value.trim());
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 与上游一致的连接标识：32 位小写十六进制 GUID。 */
export function createEdgeConnectionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function createEdgeRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * 上游要求的时间戳格式（固定使用 UTC + 固定 GMT 字面量）。
 * speech.config 不带结尾 Z，ssml 带结尾 Z —— 与参考实现保持一致。
 */
export function formatEdgeTimestamp(date: Date = new Date(), zulu = false): string {
  const base =
    `${EDGE_DATE_DAYS[date.getUTCDay()]} ${EDGE_DATE_MONTHS[date.getUTCMonth()]} ` +
    `${pad2(date.getUTCDate())} ${date.getUTCFullYear()} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())} ` +
    "GMT+0000 (Coordinated Universal Time)";
  return zulu ? `${base}Z` : base;
}

function escapeEdgeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;");
}

/** Synapse 的倍速（0.25–4）映射为 SSML prosody rate 百分比。 */
export function toEdgeProsodyRate(speed: number): string {
  const safe = Number.isFinite(speed) ? Math.min(4, Math.max(0.25, speed)) : 1;
  const percent = Math.round((safe - 1) * 100);
  return `${percent >= 0 ? "+" : "-"}${Math.abs(percent)}%`;
}

export function resolveEdgeLocale(voice: string): string {
  const match = /^([A-Za-z]{2,3}-[A-Za-z0-9]{2,8})/.exec(voice);
  return match ? match[1] : "en-US";
}

export function buildEdgeSpeechConfigMessage(date: Date = new Date()): string {
  const body = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataOptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
          outputFormat: EDGE_AUDIO_OUTPUT_FORMAT,
        },
        language: { autoDetection: false },
      },
    },
  });
  return [
    `X-Timestamp:${formatEdgeTimestamp(date)}`,
    "Content-Type:application/json; charset=utf-8",
    "Path:speech.config",
    "",
    "",
    body,
  ].join("\r\n");
}

export function buildEdgeSsmlMessage(
  text: string,
  voice: string,
  speed: number,
  options: { requestId: string; date?: Date },
): string {
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${resolveEdgeLocale(voice)}'>` +
    `<voice name='${escapeEdgeXml(voice)}'>` +
    `<prosody rate='${toEdgeProsodyRate(speed)}'>${escapeEdgeXml(text)}</prosody>` +
    "</voice></speak>";
  return [
    `X-RequestId:${options.requestId}`,
    "Content-Type:application/ssml+xml",
    `X-Timestamp:${formatEdgeTimestamp(options.date ?? new Date(), true)}`,
    "Path:ssml",
    "",
    "",
    ssml,
  ].join("\r\n");
}

function isHighSurrogate(value: number): boolean {
  return (value & 0xfc00) === 0xd800;
}

/**
 * 把文本切成不超过 maxLength 的块：优先句末标点，其次从句标点，
 * 都不满足时硬切（硬切前避开 UTF-16 代理对，防止切出半个字符）。
 */
export function splitEdgeText(text: string, maxLength = EDGE_MAX_CHUNK_CHARS): string[] {
  const normalized = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!normalized) return [];

  const limit = Math.max(1, Math.floor(maxLength));
  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    let sentenceEnd = -1;
    let clauseEnd = -1;

    for (let index = window.length - 1; index >= 0; index -= 1) {
      const char = window[index] as string;
      // 英文句点只在其后是空白（或已在窗口末尾）时才算句子边界，避免切开 "3.14" 这类数字。
      const isPeriod = char === "." && (index + 1 >= window.length || /\s/.test(window[index + 1] as string));
      if (EDGE_SENTENCE_BOUNDARY_PATTERN.test(char) || isPeriod) {
        sentenceEnd = index + 1;
        break;
      }
      if (clauseEnd < 0 && EDGE_CLAUSE_BOUNDARY_PATTERN.test(char)) {
        clauseEnd = index + 1;
      }
    }

    let end = sentenceEnd >= 0 ? sentenceEnd : clauseEnd;
    // 标点切点太靠前（丢弃过半内容）时不划算，改为硬切到上限。
    if (end < limit >> 1) {
      end = limit;
    }
    // 切点前一个码元若是高位代理，说明代理对被切开（块尾会落单），回退一格让出整对。
    if (end > 1 && isHighSurrogate(remaining.charCodeAt(end - 1))) {
      end -= 1;
    }

    const head = remaining.slice(0, end).trim();
    if (head) chunks.push(head);
    remaining = remaining.slice(end).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

/** 音色列表地址：沿用 baseUrl 的主机，路径固定。 */
export function buildEdgeVoiceListUrl(baseUrl: string): string {
  const fallbackHost = "speech.platform.bing.com";
  let host = fallbackHost;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.host) host = parsed.host;
  } catch {
    host = fallbackHost;
  }
  return `https://${host}/consumer/speech/synthesize/readaloud/voices/list`;
}
