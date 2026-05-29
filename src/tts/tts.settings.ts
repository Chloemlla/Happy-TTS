import { RuntimeConfigService } from "../services/runtimeConfigService";
import type { TtsSettingsStore } from "./tts.ports";

export class RuntimeConfigTtsSettingsStore implements TtsSettingsStore {
  public async getGenerationCode() {
    const config = RuntimeConfigService.getCachedConfig().tts;
    return config.generationCode || null;
  }
}

export const ttsSettingsStore = new RuntimeConfigTtsSettingsStore();
