export interface TtsRequest {
  text: string;
  voice: string;
  model: string;
  output_format: string;
  speed: number;
}

export interface TtsResponse {
  audioUrl: string;
} 