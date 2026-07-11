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
  token: string;
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
  userId: string;
  token: string;
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
