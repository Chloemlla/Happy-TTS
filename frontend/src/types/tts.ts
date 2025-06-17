export interface TtsRequest {
  text: string;
  voice: string;
  model: string;
  output_format: string;
  speed: number;
  userId?: string;
  isAdmin?: boolean;
  generationCode: string;
}

export interface TtsResponse {
  audioUrl: string;
  isDuplicate?: boolean;
} 