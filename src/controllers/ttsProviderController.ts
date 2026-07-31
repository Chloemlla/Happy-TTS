import type { Request, Response } from "express";
import { config } from "../config/config";
import { buildTtsProviderPublicConfig } from "../config/ttsProviderConfig";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import logger from "../utils/logger";

export const ttsProviderController = {
  async getPublicConfig(_req: Request, res: Response) {
    try {
      const runtimeConfig = await RuntimeConfigService.getRawTtsProviderConfig();
      return res.json({
        success: true,
        config: buildTtsProviderPublicConfig(runtimeConfig, {
          model: config.openaiModel,
          voice: config.openaiVoice,
        }),
      });
    } catch (error) {
      logger.warn("[TTS] Failed to read public provider config", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(503).json({ success: false, error: "TTS 提供方配置暂不可用" });
    }
  },

  async getAdminConfig(_req: Request, res: Response) {
    try {
      const setting = await RuntimeConfigService.getTtsProviderSetting();
      return res.json({ success: true, config: setting.config });
    } catch (error) {
      logger.warn("[TTS] Failed to read administrator provider config", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(503).json({ success: false, error: "读取 TTS 提供方配置失败" });
    }
  },

  async updateAdminConfig(req: Request, res: Response) {
    try {
      await RuntimeConfigService.setTtsProviderSetting(req.body);
      const setting = await RuntimeConfigService.getTtsProviderSetting();
      return res.json({ success: true, config: setting.config });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 TTS 提供方配置失败",
      });
    }
  },
};
