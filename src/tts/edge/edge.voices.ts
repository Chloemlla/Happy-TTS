import type { TtsProviderOption } from "../../config/ttsProviderConfig";
import { isEdgeVoiceId } from "./edge.protocol";
import { EDGE_BUILTIN_VOICE_OPTIONS } from "./edge.voices.snapshot";

export const EDGE_MAX_CATALOG_SIZE = 1000;

const EDGE_VOICE_NAME_MAX_LENGTH = 128;
const EDGE_VOICE_DESCRIPTION_MAX_LENGTH = 200;

function camelToWords(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}

/** 从 ShortName 推导显示名：去掉尾部 Neural，取下最后一段并拆驼峰。 */
function deriveEdgeVoiceName(voiceId: string): string {
  const withoutSuffix = voiceId.replace(/Neural$/, "");
  const tail = withoutSuffix.slice(withoutSuffix.lastIndexOf("-") + 1);
  const words = camelToWords(tail || voiceId);
  return (words || voiceId).slice(0, EDGE_VOICE_NAME_MAX_LENGTH);
}

function toText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeEdgeVoiceEntry(value: unknown): TtsProviderOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = (toText(raw.ShortName, 128) || toText(raw.id, 128)).trim();
  if (!isEdgeVoiceId(id)) return null;

  const providedName = toText(raw.name, EDGE_VOICE_NAME_MAX_LENGTH);
  const name = providedName || deriveEdgeVoiceName(id);

  const providedDescription = toText(raw.description, EDGE_VOICE_DESCRIPTION_MAX_LENGTH);
  const localeName = toText(raw.LocaleName, 128) || toText(raw.Locale, 32);
  const gender =
    raw.Gender === "Female"
      ? "女"
      : raw.Gender === "Male"
        ? "男"
        : toText(raw.Gender, 16);
  const derivedDescription = [localeName, gender].filter(Boolean).join(" · ");
  const description = (providedDescription || derivedDescription).slice(0, EDGE_VOICE_DESCRIPTION_MAX_LENGTH);

  return description ? { id, name, description } : { id, name };
}

/** 把上游音色列表（或已归一化的存档）整理成前端可用的音色选项。 */
export function normalizeEdgeVoiceCatalog(payload: unknown): TtsProviderOption[] {
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { voices?: unknown }).voices)
      ? ((payload as { voices: unknown[] }).voices as unknown[])
      : [];

  const unique = new Map<string, TtsProviderOption>();
  for (const record of records) {
    if (unique.size >= EDGE_MAX_CATALOG_SIZE) break;
    const entry = normalizeEdgeVoiceEntry(record);
    if (entry && !unique.has(entry.id)) unique.set(entry.id, entry);
  }
  return Array.from(unique.values());
}

/** 运行时音色清单：管理员刷新过则用刷新结果，否则用内置快照。 */
export function resolveEdgeVoiceOptions(
  configured: readonly TtsProviderOption[] | undefined,
): TtsProviderOption[] {
  if (configured && configured.length > 0) {
    return configured.map((entry) => ({ ...entry }));
  }
  return EDGE_BUILTIN_VOICE_OPTIONS.map((entry) => ({ ...entry }));
}
