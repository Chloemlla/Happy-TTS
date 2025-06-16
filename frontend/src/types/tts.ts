export interface TtsRequest {
  text: string;
  voice: string;
  model: string;
  output_format: string;
  speed: number;
  userId?: string;
  isAdmin?: boolean;
}

export interface TtsResponse {
  audioUrl: string;
  isDuplicate?: boolean;
} 