import axios, { type AxiosResponse } from "axios";
import crypto from "node:crypto";
import logger from "../utils/logger";

/**
 * CDict 上游代理服务。
 *
 * CDict Android 客户端不再直连第三方翻译网关 / 语音合成 / 词典音频，统一请求本服务；
 * 上游地址、appId、appKey 与签名算法只存在于服务端。默认值与客户端历史版本一致，
 * 可通过环境变量覆盖（VIVO_TRANSLATE_* / VIVO_TTS_*）。
 */

const TRANSLATE_BASE_URL = (process.env.VIVO_TRANSLATE_BASE_URL || "https://vivotrans.vivo.com").trim();
const TRANSLATE_APP_ID = (process.env.VIVO_TRANSLATE_APP_ID || "9023957766").trim();
const TRANSLATE_PATH = "/translation/query";
const LANGUAGE_LIST_PATH = "/translation/lang/list";

const TTS_URL = (process.env.VIVO_TTS_URL || "https://vivotrans.vivo.com.cn/fy/tts").trim();
const TTS_APP_ID = (process.env.VIVO_TTS_APP_ID || "1336541186").trim();
const TTS_APP_KEY = (process.env.VIVO_TTS_APP_KEY || "9925f42b456c96de8e424ddc7c06d5d9").trim();

const YOUDAO_VOICE_URL = "https://dict.youdao.com/dictvoice";
const UPSTREAM_TIMEOUT_MS = 20000;
const UPSTREAM_USER_AGENT = "okhttp/4.9.1";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

/** 上游 TTS 把 deviceid 当数值解析，带前导零会被拒（HTTP 400 "Leading zeroes not allowed"）。 */
const TTS_DEVICE_ID = "0";

export interface CDictTranslateInput {
  text: string;
  from: string;
  to: string;
}

export interface CDictAudio {
  contentType: string;
  data: Buffer;
}

/**
 * 复刻 java.net.URLEncoder.encode(s, "UTF-8")：空格 -> '+'，A-Za-z0-9 与 .-*_ 原样，
 * 其余按 UTF-8 字节大写百分号编码。不能用 URLSearchParams —— 它会把 '*' 编成 %2A，
 * 与客户端历史请求的字节序列不一致。
 */
function javaFormEncode(value: string): string {
  let out = "";
  for (const char of value) {
    if (/^[A-Za-z0-9.\-*_]$/.test(char)) {
      out += char;
      continue;
    }
    if (char === " ") {
      out += "+";
      continue;
    }
    for (const byte of Buffer.from(char, "utf8")) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/** 按插入顺序拼接表单/查询串，编码语义与客户端 encodeForm 一致。 */
function encodeForm(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${javaFormEncode(key)}=${javaFormEncode(value)}`)
    .join("&");
}

/** 16 位字母数字 nonce，字符集与客户端 randomAlphanumeric 一致。 */
function randomAlphanumeric(length: number): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

/** 设备/SDK 参数：上游只强校验 appId，设备值不要求真实匹配。 */
function deviceParams(): Record<string, string> {
  return {
    em: "00000000000000",
    model: "V2309A",
    product: "PD2243",
    deviceType: "mobile",
    elapsedtime: "0",
    av: "1",
    an: "1.0.0",
    cs: "0",
    sysVer: "14",
    appVersion: "1",
    appVer: "1.0.0",
    appPkgName: "com.vivo.translator",
    netType: "2",
    screensize: "1080x2400",
    oaid: "",
    vaid: "00000000000000",
  };
}

function extractUpstreamError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const payload = error.response?.data;
    const detail =
      typeof payload === "string"
        ? payload.slice(0, 200)
        : (payload as Record<string, unknown> | undefined)?.message ||
          (payload as Record<string, unknown> | undefined)?.msg ||
          error.message;
    return status ? `${fallback}（上游 HTTP ${status}）: ${String(detail)}` : `${fallback}: ${String(detail)}`;
  }
  return `${fallback}: ${error instanceof Error ? error.message : String(error)}`;
}

/** 文本翻译：请求体字段与顺序完全复刻客户端历史请求；响应体原样透传。 */
export async function translateText(input: CDictTranslateInput): Promise<Record<string, unknown>> {
  const body = encodeForm({
    text: input.text,
    from: input.from,
    to: input.to,
    requestId: crypto.randomUUID(),
    appId: TRANSLATE_APP_ID,
    app: "com.vivo.translator",
    user_id: "com.vivo.translator",
    ...deviceParams(),
  });
  try {
    const response: AxiosResponse<Record<string, unknown>> = await axios.post(
      `${TRANSLATE_BASE_URL}${TRANSLATE_PATH}`,
      body,
      {
        timeout: UPSTREAM_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UPSTREAM_USER_AGENT,
          "Content-Length": Buffer.byteLength(body, "utf8").toString(),
        },
        responseType: "json",
      },
    );
    return response.data ?? {};
  } catch (error) {
    logger.warn("[CDict] 上游翻译失败", { from: input.from, to: input.to });
    throw new Error(extractUpstreamError(error, "上游翻译请求失败"));
  }
}

/** 语言列表：设备参数走查询串，与客户端历史请求一致；响应体原样透传。 */
export async function fetchLanguageList(): Promise<unknown> {
  try {
    const response = await axios.get(`${TRANSLATE_BASE_URL}${LANGUAGE_LIST_PATH}?${encodeForm(deviceParams())}`, {
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: { "User-Agent": UPSTREAM_USER_AGENT },
      responseType: "json",
    });
    return response.data ?? {};
  } catch (error) {
    throw new Error(extractUpstreamError(error, "上游语言列表请求失败"));
  }
}

/**
 * 上游签名（libspeech_sec.so 逆向）：
 *   1. 参数按 key 升序拼接 appId & deviceid & nonce_str & taskid & text(base64)
 *   2. hmacHex = hex(HMAC-SHA256(appKey, 拼接串))
 *   3. sign = hex(MD5(hmacHex + "&key=" + appKey))
 */
function ttsSignature(params: string): string {
  const hmacHex = crypto.createHmac("sha256", TTS_APP_KEY).update(params, "utf8").digest("hex");
  return crypto.createHash("md5").update(`${hmacHex}&key=${TTS_APP_KEY}`, "utf8").digest("hex");
}

function detectAudioContentType(data: Buffer): string {
  if (data.length >= 4 && data.toString("ascii", 0, 4) === "RIFF") return "audio/wav";
  if (data.length >= 3 && data.toString("ascii", 0, 3) === "ID3") return "audio/mpeg";
  if (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) return "audio/mpeg";
  // aue=3 / auf=audio/L16 时上游可能返回无容器 PCM，客户端会自行补 WAV 头。
  return "audio/L16; rate=16000";
}

/** 在线合成引擎：成功返回音频字节；上游以 {"errorResult":{…}} 拒绝时抛错。 */
export async function synthesizeSpeech(text: string, langType: string): Promise<CDictAudio> {
  const taskId = crypto.randomUUID().replace(/-/g, "");
  const nonce = randomAlphanumeric(16);
  const textB64 = Buffer.from(text, "utf8").toString("base64");
  const signedParams = `appId=${TTS_APP_ID}&deviceid=${TTS_DEVICE_ID}&nonce_str=${nonce}&taskid=${taskId}&text=${textB64}`;
  const body = JSON.stringify({
    appId: TTS_APP_ID,
    deviceid: TTS_DEVICE_ID,
    taskid: taskId,
    nonce_str: nonce,
    aue: 3,
    auf: "audio/L16;rate=16000",
    vcn: "women",
    speed: 70,
    volume: 50,
    pitch: 50,
    langType,
    text: textB64,
    encoding: "utf-8",
    sign: ttsSignature(signedParams),
    sysVer: "14",
    product: "PD2243",
    model: "V2309A",
    appVer: "4.5.9.0",
    app: "com.vivo.translator",
  });
  let response: AxiosResponse<ArrayBuffer>;
  try {
    response = await axios.post(TTS_URL, body, {
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body, "utf8").toString(),
      },
      responseType: "arraybuffer",
    });
  } catch (error) {
    throw new Error(extractUpstreamError(error, "上游语音合成请求失败"));
  }
  const data = Buffer.from(response.data);
  if (data.length === 0) throw new Error("上游语音合成返回空音频");
  const head = data.subarray(0, 1024).toString("utf8");
  if (head.includes("errorResult")) {
    const code = /"errorCode"\s*:\s*"?([^,"}\s]+)"?/.exec(head)?.[1];
    const message = /"errorMsg"\s*:\s*"([^"]*)"/.exec(head)?.[1];
    throw new Error(`上游语音合成拒绝 errorCode=${code ?? "-"} errorMsg=${message ?? "-"}`);
  }
  return { contentType: detectAudioContentType(data), data };
}

/** 词典静态音频：查询串与 UA 复刻客户端历史请求；只接受音频响应，错误页/空体一律抛错以便客户端回退。 */
export async function fetchDictionaryVoice(text: string, type: number): Promise<CDictAudio> {
  const url = `${YOUDAO_VOICE_URL}?audio=${javaFormEncode(text)}&type=${type}`;
  let response: AxiosResponse<ArrayBuffer>;
  try {
    response = await axios.get(url, {
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: { "User-Agent": BROWSER_USER_AGENT },
      responseType: "arraybuffer",
    });
  } catch (error) {
    throw new Error(extractUpstreamError(error, "上游词典音频请求失败"));
  }
  const data = Buffer.from(response.data);
  if (data.length === 0) throw new Error("上游词典音频返回空响应体");
  const upstreamType = String(response.headers["content-type"] || "");
  if (upstreamType && !upstreamType.toLowerCase().startsWith("audio/")) {
    throw new Error(`上游词典音频返回非音频响应 content-type=${upstreamType}`);
  }
  const contentType = upstreamType.toLowerCase().startsWith("audio/")
    ? upstreamType
    : detectAudioContentType(data);
  if (!contentType.toLowerCase().startsWith("audio/")) {
    throw new Error("上游词典音频返回非音频格式");
  }
  return { contentType, data };
}
