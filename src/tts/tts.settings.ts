import { RuntimeConfigService } from "../services/runtimeConfigService";
import type { TtsSettingsStore } from "./tts.ports";

export class RuntimeConfigTtsSettingsStore implements TtsSettingsStore {
  public async getGenerationCode() {
    const config = await RuntimeConfigService.getRawTtsConfig();
    return config.generationCode || null;
  }
}

export const ttsSettingsStore = new RuntimeConfigTtsSettingsStore();
