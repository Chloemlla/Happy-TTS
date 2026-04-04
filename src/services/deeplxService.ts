import axios from "axios";
import { config } from "../config/config";

const TRUSTED_DEEPLX_PROTOCOL = "https:";
const TRUSTED_DEEPLX_HOST = "api.deeplx.org";
const TRUSTED_DEEPLX_BASE_URL = `${TRUSTED_DEEPLX_PROTOCOL}//${TRUSTED_DEEPLX_HOST}`;

export interface DeepLXConfigSummary {
  enabled: boolean;
  requiresApiKey: boolean;
  baseUrl: string;
  endpointPath: string;
}

export interface DeepLXTranslateParams {
  text: string;
  sourceLang: string;
  targetLang: string;
}

export interface DeepLXTranslateResult {
  translatedText: string;
  alternatives: string[];
  sourceLang: string;
  targetLang: string;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function getNormalizedBaseUrl(): string {
  return config.deeplx.baseUrl.trim().replace(/\/+$/, "");
}

function isApprovedDeepLXBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === TRUSTED_DEEPLX_PROTOCOL &&
      parsed.hostname.toLowerCase() === TRUSTED_DEEPLX_HOST &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.pathname || parsed.pathname === "/")
    );
  } catch {
    return false;
  }
}

function getVerifiedDeepLXBaseUrl(): string {
  const configuredBaseUrl = getNormalizedBaseUrl();
  if (!isApprovedDeepLXBaseUrl(configuredBaseUrl)) {
    throw new Error(`DeepLX base URL must use ${TRUSTED_DEEPLX_BASE_URL}`);
  }

  return TRUSTED_DEEPLX_BASE_URL;
}

function requiresApiKey(baseUrl = getNormalizedBaseUrl()): boolean {
  return isApprovedDeepLXBaseUrl(baseUrl);
}

function getApiKey(): string {
  return config.deeplx.apiKey.trim();
}

export function buildDeepLXTranslateUrl(): string {
  const baseUrl = getVerifiedDeepLXBaseUrl();
  const apiKey = getApiKey();

  if (apiKey) {
    return `${baseUrl}/${encodeURIComponent(apiKey)}/translate`;
  }

  return `${baseUrl}/translate`;
}

export function isDeepLXConfigured(): boolean {
  const baseUrl = getNormalizedBaseUrl();
  if (!baseUrl) {
    return false;
  }

  return isApprovedDeepLXBaseUrl(baseUrl) && Boolean(getApiKey());
}

export function getDeepLXConfigSummary(): DeepLXConfigSummary {
  const configuredBaseUrl = getNormalizedBaseUrl();
  const baseUrl = isApprovedDeepLXBaseUrl(configuredBaseUrl)
    ? TRUSTED_DEEPLX_BASE_URL
    : configuredBaseUrl;
  return {
    enabled: isDeepLXConfigured(),
    requiresApiKey: requiresApiKey(),
    baseUrl,
    endpointPath: requiresApiKey(baseUrl)
      ? `${baseUrl}/<api-key>/translate`
      : `${baseUrl}/translate`,
  };
}

function normalizeLanguage(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.toLowerCase() === "auto" ? "auto" : trimmed.toUpperCase();
}

function extractTranslation(
  payload: unknown,
  fallbackSource: string,
  fallbackTarget: string,
): DeepLXTranslateResult {
  const source = asObject(payload);

  const directText = firstString(source.data, source.translation, source.text, source.result);
  if (directText) {
    return {
      translatedText: directText,
      alternatives: stringArray(source.alternatives),
      sourceLang: normalizeLanguage(
        firstString(source.source_lang, source.detected_source_language, source.from) ||
          fallbackSource,
        fallbackSource,
      ),
      targetLang: normalizeLanguage(
        firstString(source.target_lang, source.to) || fallbackTarget,
        fallbackTarget,
      ),
    };
  }

  const translations = Array.isArray(source.translations) ? source.translations : [];
  for (const item of translations) {
    const entry = asObject(item);
    const translatedText = firstString(
      entry.text,
      entry.translation,
      entry.translated_text,
      entry.data,
    );

    if (translatedText) {
      return {
        translatedText,
        alternatives: stringArray(entry.alternatives),
        sourceLang: normalizeLanguage(
          firstString(
            entry.detected_source_language,
            entry.source_lang,
            source.source_lang,
          ) || fallbackSource,
          fallbackSource,
        ),
        targetLang: normalizeLanguage(
          firstString(entry.target_lang, source.target_lang) || fallbackTarget,
          fallbackTarget,
        ),
      };
    }
  }

  throw new Error("DeepLX returned an invalid translation payload");
}

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const responseData = asObject(error.response?.data);
    return (
      firstString(
        responseData.message,
        responseData.error,
        responseData.detail,
        error.message,
      ) || "DeepLX translation request failed"
    );
  }

  return error instanceof Error ? error.message : "DeepLX translation request failed";
}

export async function translateWithDeepLX(
  params: DeepLXTranslateParams,
): Promise<DeepLXTranslateResult> {
  if (!isDeepLXConfigured()) {
    throw new Error("DeepLX is not configured");
  }

  const text = params.text.trim();
  if (!text) {
    throw new Error("Translation text is required");
  }

  const sourceLang = normalizeLanguage(params.sourceLang, "auto");
  const targetLang = normalizeLanguage(params.targetLang, "EN");

  try {
    const response = await axios.post(
      buildDeepLXTranslateUrl(),
      {
        text,
        source_lang: sourceLang,
        target_lang: targetLang,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 20000,
      },
    );

    return extractTranslation(response.data, sourceLang, targetLang);
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}
