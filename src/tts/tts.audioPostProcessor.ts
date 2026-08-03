import { config } from "../config/config";
import logger from "../utils/logger";
import { TtsGenerationError } from "./tts.errors";
import type { TtsAudioPostProcessInput, TtsAudioPostProcessResult, TtsAudioPostProcessor } from "./tts.ports";

export class DefaultTtsAudioPostProcessor implements TtsAudioPostProcessor {
  public async process(input: TtsAudioPostProcessInput): Promise<TtsAudioPostProcessResult> {
    return this.passthrough(input);
  }

  private passthrough(input: TtsAudioPostProcessInput): TtsAudioPostProcessResult {
    return {
      audioBuffer: input.audioBuffer,
      outputFormat: input.outputFormat,
      source: "node-passthrough",
    };
  }
}

export const ttsAudioPostProcessor = new DefaultTtsAudioPostProcessor();
