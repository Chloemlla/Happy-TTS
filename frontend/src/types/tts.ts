export interface TtsRequest {
  text: string;
  model: string;
  voice: string;
  outputFormat: string;
  speed: number;
  generationCode: string;
  cfToken?: string;
  fingerprint?: string;
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
  audioUrl: string;
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
