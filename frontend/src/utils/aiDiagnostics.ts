import type { AiErrorDetails, AiProviderFailure } from "../types/aiDiagnostics";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseProviderFailure(value: unknown): AiProviderFailure | null {
  if (!isRecord(value)) return null;
  const baseUrl = readString(value.baseUrl);
  const model = readString(value.model);
  const message = readString(value.message);
  const occurredAt = readString(value.occurredAt);
  const code = readString(value.code);
  if (!baseUrl || !model || !message || !occurredAt) return null;

  return {
    baseUrl,
    model,
    message,
    occurredAt,
    ...(typeof value.status === "number" && Number.isFinite(value.status) ? { status: value.status } : {}),
    ...(code ? { code } : {}),
  };
}

export function parseAiErrorDetails(value: unknown): AiErrorDetails | undefined {
  if (!isRecord(value)) return undefined;
  const reason = value.reason;
  const summary = readString(value.summary);
  const occurredAt = readString(value.occurredAt);
  if (
    (reason !== "no_provider_configured" && reason !== "all_providers_failed") ||
    !summary ||
    !occurredAt
  ) {
    return undefined;
  }

  const attempts = Array.isArray(value.attempts)
    ? value.attempts.map(parseProviderFailure).filter((attempt): attempt is AiProviderFailure => Boolean(attempt))
    : [];
  return { reason, summary, attempts, occurredAt };
}
