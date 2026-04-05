export interface TtsRequest {
  text: string;
  model: string;
  voice: string;
  outputFormat: string;
  speed: number;
  generationCode: string;
  cfToken?: string;
}

export interface TtsUsageSummary {
  authenticated: boolean;
  isAdmin: boolean;
  dailyLimit: number | null;
  usedToday: number | null;
  remainingToday: number | null;
}

export interface TtsNextAction {
  type: "play_or_download" | "reuse_existing_audio" | "check_generation_code" | "complete_verification" | "wait_for_quota_reset" | "retry";
  label: string;
  message: string;
}

export interface TtsResponse {
  success: boolean;
  status: "generated" | "reused";
  message: string;
  audioUrl: string;
  fileName?: string; // 兼容后端 fileName 字段
  signature: string;
  isDuplicate?: boolean;
  outputFormat?: string;
  usage?: TtsUsageSummary;
  nextAction?: TtsNextAction;
}
