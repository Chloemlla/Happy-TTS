export interface AiProviderFailure {
  baseUrl: string;
  model: string;
  status?: number;
  code?: string;
  message: string;
  occurredAt: string;
}

export interface AiErrorDetails {
  reason: "no_provider_configured" | "all_providers_failed";
  summary: string;
  attempts: AiProviderFailure[];
  occurredAt: string;
}
