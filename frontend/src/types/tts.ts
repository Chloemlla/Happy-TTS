export interface TtsRequest {
  text: string;
  model: string;
  voice: string;
  outputFormat: string;
  speed: number;
  userId?: string;
  isAdmin?: boolean;
  customFileName?: string;
  generationCode: string;
  cfToken?: string; // Cloudflare Turnstile token
}

export interface TtsResponse {
  success: boolean;
  audioUrl?: string;
  fileName?: string; // 兼容后端 fileName 字段
  signature: string;
  isDuplicate?: boolean;
} 