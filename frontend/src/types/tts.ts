export interface TtsRequest {
  text: string;
  model: string;
  voice: string;
  outputFormat: string;
  speed: number;
  userId?: string;
  isAdmin?: boolean;
  customFileName?: string;
}

export interface TtsResponse {
  success: boolean;
  audioUrl: string;
  signature: string;
  isDuplicate?: boolean;
} 