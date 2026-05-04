import { join } from "node:path";
import { TtsService } from "../tts/tts.service";

export interface TTSOptions {
  text: string;
  model: "tts-1" | "tts-1-hd";
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  outputFormat: "mp3" | "opus" | "aac" | "flac";
  speed?: number;
  customFileName?: string;
}

const ttsService = new TtsService();

export async function generateSpeech(options: TTSOptions): Promise<string> {
  const result = await ttsService.generateSpeech({
    text: options.text,
    model: options.model,
    voice: options.voice,
    outputFormat: options.outputFormat,
    speed: options.speed ?? 1.0,
  });

  return join(process.cwd(), "finish", result.fileName);
}
