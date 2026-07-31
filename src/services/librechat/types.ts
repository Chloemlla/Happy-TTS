export interface ImageRecord {
  updateTime: string;
  updateTimeShanghai?: string;
  imageUrl: string;
}

export interface ChatMessage {
  id: string;
  message: string;
  role?: "user" | "assistant";
  timestamp: string;
  /** Canonical, namespaced digest used for all new ownership checks. */
  ownerKey?: string;
  /** Legacy fields are read only while normalizing older file-backed data. */
  token?: string;
  userId?: string;
  aiErrorDetails?: ChatFailureDiagnostics;
}

export interface ChatHistory {
  messages: ChatMessage[];
  total: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface SSEClient {
  id: string;
  ownerKey: string;
  res: any;
  lastPing: number;
}

export interface ChatProviderFailureAttempt {
  baseUrl: string;
  model: string;
  status?: number;
  code?: string;
  message: string;
  occurredAt: Date;
}

export interface ChatFailureDiagnostics {
  reason: "no_provider_configured" | "all_providers_failed";
  summary: string;
  attempts: ChatProviderFailureAttempt[];
  occurredAt: Date;
}
