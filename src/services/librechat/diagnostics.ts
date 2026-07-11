import type { ChatProviderFailureAttempt } from "./types";

interface ChatProviderDescriptor {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function redactEmbeddedSecrets(value: string, apiKey: string): string {
  let redacted = value;
  if (apiKey) {
    redacted = redacted.split(apiKey).join("[redacted]");
    redacted = redacted.split(encodeURIComponent(apiKey)).join("[redacted]");
  }
  return redacted
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/Basic\s+[^\s,;]+/gi, "Basic [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/([?&](?:api[-_]?key|token|secret|authorization|password|passwd)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b(?:authorization|cookie|api[-_]?key|token|secret|password|passwd)\s*[:=]\s*[^\s,;]+/gi, (match) => {
      const separatorIndex = Math.max(match.indexOf(":"), match.indexOf("="));
      return separatorIndex >= 0 ? `${match.slice(0, separatorIndex + 1)}[redacted]` : "[redacted]";
    });
}

function sanitizeProviderBaseUrl(baseUrl: string, apiKey: string): string {
  const redacted = redactEmbeddedSecrets(baseUrl, apiKey);
  try {
    const parsed = new URL(redacted);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return redacted.slice(0, 512);
  }
}

function firstNonEmptyString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function buildChatProviderFailureAttempt(
  provider: ChatProviderDescriptor,
  error: unknown,
): ChatProviderFailureAttempt {
  const candidate = asRecord(error);
  const response = asRecord(candidate.response);
  const responseData = response.data;
  const responseDataRecord = asRecord(responseData);
  const responseError = asRecord(responseDataRecord.error);
  const rawMessage =
    firstNonEmptyString([
      responseError.message,
      responseDataRecord.message,
      candidate.message,
    ]) || "对话服务提供者调用失败";
  const code = firstNonEmptyString([responseError.code, candidate.code]);
  const status = typeof response.status === "number" && Number.isFinite(response.status) ? response.status : undefined;

  return {
    baseUrl: sanitizeProviderBaseUrl(provider.baseUrl, provider.apiKey),
    model: provider.model,
    ...(status === undefined ? {} : { status }),
    ...(code ? { code: redactEmbeddedSecrets(code, provider.apiKey).slice(0, 128) } : {}),
    message: redactEmbeddedSecrets(rawMessage, provider.apiKey).slice(0, 1024),
    occurredAt: new Date(),
  };
}
