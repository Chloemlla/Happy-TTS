export interface TtsRequest {
  text: string;
  model: string;
  voice?: string;
  outputFormat: string;
  speed: number;
  generationCode: string;
  /**
   * 目标提供商。始终发送：后端对未启用/非法的值会回落主提供商，
   * 让单提供商与多提供商走同一条请求路径。
   */
  provider?: TtsProviderId;
  cfToken?: string;
  fingerprint?: string;
}

export type TtsProviderId = "openai" | "fish" | "edge";

export type TtsVoiceMode = "select" | "configured_reference" | "provider_default";

export interface TtsProviderOption {
  id: string;
  name: string;
  description?: string;
}

export interface FishAudioCatalogItem {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  languages: string[];
  tags: string[];
  sampleAudio?: string;
  author?: string;
}

export interface TtsProviderPublicConfig {
  provider: TtsProviderId;
  defaultModel: string;
  defaultVoice?: string;
  models: TtsProviderOption[];
  voices: TtsProviderOption[];
  voiceMode: TtsVoiceMode;
  /**
   * 管理员启用多个提供商时后端才下发的列表，主提供商排第一；
   * 单项本身不会嵌套 providers（避免自引用）。
   */
  providers?: TtsProviderPublicConfig[];
}

export interface TtsUsageSummary {
  authenticated: boolean;
  isAdmin: boolean;
  dailyLimit: number | null;
  usedToday: number | null;
  remainingToday: number | null;
}

export interface TtsNextAction {
  type: string;
  label: string;
  message: string;
}

export interface TtsGovernanceSummary {
  policyVersion?: string;
  contentSafety?: {
    decision: "allow" | "review" | "block";
    confidence: number;
    categories: string[];
    source: string;
    remoteChecked: boolean;
    remoteUnavailable?: boolean;
  };
}

export interface TtsAssetWatermarkSummary {
  id: string;
  kind: "server_forensic";
  policyVersion?: string;
}

export interface TtsSubmitResponse {
  success: boolean;
  status: "queued" | "completed";
  taskId: string;
  queuePosition?: number;
  pollAfterMs?: number;
  message: string;
  usage?: TtsUsageSummary;
  nextAction?: TtsNextAction;
}

export interface TtsJobStatusResponse {
  success: boolean;
  taskId: string;
  status: "queued" | "processing" | "completed" | "failed";
  message: string;
  error?: string;
  resultReady?: boolean;
  queuePosition?: number;
  usage?: TtsUsageSummary;
  nextAction?: TtsNextAction;
}

export interface TtsResponse {
  success: boolean;
  status: "generated" | "reused";
  message: string;
  text?: string;
  audioUrl: string;
  audioFileId?: string;
  audioStorage?: "file" | "mongo";
  audioMimeType?: string;
  audioSize?: number;
  taskId?: string;
  fileName?: string; // 兼容后端 fileName 字段
  signature: string;
  isDuplicate?: boolean;
  outputFormat?: string;
  watermark?: TtsAssetWatermarkSummary;
  permissions?: {
    canDownload: boolean;
    canShare: boolean;
  };
  governance?: TtsGovernanceSummary;
  usage?: TtsUsageSummary;
  nextAction?: TtsNextAction;
}

export type TtsHistoryReviewStatus = "none" | "needs_review" | "in_review" | "fixed" | "dismissed";

export interface TtsHistoryRecord {
  id: string;
  scope: "user" | "anonymous";
  userId?: string;
  ip?: string;
  fingerprint?: string;
  text: string;
  voice: string;
  model: string;
  outputFormat: string;
  speed: number;
  contentHash: string;
  fileName: string;
  audioUrl: string;
  audioFileId?: string;
  audioStorage?: "file" | "mongo";
  audioMimeType?: string;
  audioSize?: number;
  signature?: string;
  provider: string;
  providerModel: string;
  providerVoice: string;
  createdAt: string;
  adminNote?: string;
  adminSuggestion?: string;
  reviewStatus?: TtsHistoryReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  fixedAt?: string;
  updatedAt?: string;
  permissions?: {
    canDownload: boolean;
    canShare: boolean;
  };
}

export interface TtsAdminHistoryResponse {
  records: TtsHistoryRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface TtsAdminReviewUpdateResponse {
  success: boolean;
  record: TtsHistoryRecord;
  error?: string;
}
