export interface FishAudioCatalogRequest {
  url: string;
  headers: Record<string, string>;
}

export interface FishAudioCatalogConfig {
  modelRequest?: FishAudioCatalogRequest;
  defaultVoicesRequest?: FishAudioCatalogRequest;
}

const MAX_CURL_LENGTH = 32_768;
const ALLOWED_HEADER_PATTERN = /^(accept|accept-language|cache-control|origin|pragma|priority|referer|user-agent|authorization|sec-ch-ua|sec-ch-ua-mobile|sec-ch-ua-platform|sec-fetch-dest|sec-fetch-mode|sec-fetch-site|x-fish-amp-device-id|x-fish-amp-session-id|x-team-id|x-workspace-id)$/i;
const TRUSTED_HOSTS = new Set(["api.fish.audio"]);

function tokenizeCurl(value: string): string[] {
  const normalized = value
    .replace(/\^"/g, '"')
    .replace(/\^\r?\n/g, " ")
    .replace(/\^/g, "")
    .replace(/\\"/g, '"');
  const tokens: string[] = [];
  let token = "";
  let quote = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (quote) {
      if (character === quote) {
        quote = "";
      } else {
        token += character;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
    } else {
      token += character;
    }
  }
  if (quote) throw new Error("Fish Audio curl 引号不完整");
  if (token) tokens.push(token);
  return tokens;
}

function normalizeCatalogUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Fish Audio curl 必须包含有效的 HTTP 或 HTTPS URL");
  }
  if (parsed.protocol !== "https:" || !TRUSTED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Fish Audio curl 只允许请求 https://api.fish.audio");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("Fish Audio curl URL 不能包含用户名、密码或片段");
  }
  return parsed.toString();
}

export function normalizeFishAudioCatalogRequest(value: unknown): FishAudioCatalogRequest | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const request = value as Record<string, unknown>;
  if (typeof request.url !== "string" || !request.url.trim()) return undefined;
  const rawHeaders = request.headers && typeof request.headers === "object" && !Array.isArray(request.headers)
    ? request.headers as Record<string, unknown>
    : {};
  const headers: Record<string, string> = {};
  for (const [name, header] of Object.entries(rawHeaders)) {
    if (typeof header === "string" && ALLOWED_HEADER_PATTERN.test(name)) {
      headers[name.toLowerCase()] = header.trim().slice(0, 4096);
    }
  }
  try {
    return { url: normalizeCatalogUrl(request.url), headers };
  } catch {
    return undefined;
  }
}

function normalizeHeaderName(value: string): string {
  const name = value.trim().toLowerCase();
  if (!ALLOWED_HEADER_PATTERN.test(name)) {
    throw new Error(`Fish Audio curl 包含不允许的请求头：${name}`);
  }
  return name;
}

function normalizeHeaderValue(name: string, value: string, previous?: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Fish Audio curl 请求头 ${name} 不能为空`);
  if (name === "authorization" && /^(?:bearer\s+)?(?:\*{3,}|<configured>|<secret>)$/i.test(normalized)) {
    if (previous) return previous;
    throw new Error("Fish Audio curl 的 Authorization 脱敏值无法用于首次配置");
  }
  if (normalized.length > 4096) throw new Error(`Fish Audio curl 请求头 ${name} 过长`);
  return normalized;
}

export function parseFishAudioCatalogCurl(
  value: unknown,
  previous?: FishAudioCatalogRequest,
  expectedPath?: string,
): FishAudioCatalogRequest {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Fish Audio curl 不能为空");
  }
  if (value.length > MAX_CURL_LENGTH) throw new Error("Fish Audio curl 过长");

  const tokens = tokenizeCurl(value.trim());
  if (!tokens[0] || !/^(?:curl|curl\.exe)$/i.test(tokens[0])) {
    throw new Error("Fish Audio 配置必须以 curl 或 curl.exe 开头");
  }

  let url = "";
  let method = "GET";
  const headers: Record<string, string> = {};
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === "-H" || token === "--header") {
      const header = tokens[++index] || "";
      const separator = header.indexOf(":");
      if (separator <= 0) throw new Error("Fish Audio curl 请求头格式无效");
      const name = normalizeHeaderName(header.slice(0, separator));
      headers[name] = normalizeHeaderValue(name, header.slice(separator + 1), previous?.headers[name]);
    } else if (token === "-X" || token === "--request") {
      method = (tokens[++index] || "").toUpperCase();
    } else if (token.startsWith("http://") || token.startsWith("https://")) {
      if (url) throw new Error("Fish Audio curl 只能包含一个 URL");
      url = token;
    } else if (token.startsWith("-")) {
      throw new Error(`Fish Audio curl 包含不支持的选项：${token}`);
    }
  }

  if (method !== "GET") throw new Error("Fish Audio 音色请求只允许 GET 方法");
  const normalizedUrl = normalizeCatalogUrl(url);
  if (expectedPath && new URL(normalizedUrl).pathname !== expectedPath) {
    throw new Error(`Fish Audio curl URL 必须使用 ${expectedPath}`);
  }
  const authorization = headers.authorization || previous?.headers.authorization;
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw new Error("Fish Audio curl 必须包含 Bearer Authorization");
  }
  headers.authorization = authorization;
  return { url: normalizedUrl, headers };
}

export function formatFishAudioCatalogCurl(
  request: FishAudioCatalogRequest | undefined,
): string {
  if (!request) return "";
  const headers = Object.entries(request.headers)
    .map(([name, value]) => {
      const safeValue = name === "authorization" ? "Bearer ***" : value;
      return `  -H \"${name}: ${safeValue.replace(/\"/g, '\\\"')}\" ^`;
    })
    .join("\n");
  return `curl \"${request.url}\" ^\n${headers}`;
}

export function normalizeFishAudioCatalogConfig(value: unknown): FishAudioCatalogConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    modelRequest: normalizeFishAudioCatalogRequest(raw.modelRequest),
    defaultVoicesRequest: normalizeFishAudioCatalogRequest(raw.defaultVoicesRequest),
  };
}
