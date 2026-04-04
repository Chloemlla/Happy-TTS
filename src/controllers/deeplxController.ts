import type { Request, Response } from "express";
import {
  getDeepLXConfigSummary,
  isDeepLXConfigured,
  translateWithDeepLX,
} from "../services/deeplxService";

const MAX_TRANSLATE_LENGTH = 5000;

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class DeepLXController {
  public static getConfig(_req: Request, res: Response) {
    res.json(getDeepLXConfigSummary());
  }

  public static async translate(req: Request, res: Response) {
    try {
      if (!isDeepLXConfigured()) {
        return res.status(503).json({ error: "DeepLX is not configured" });
      }

      const text = readText(req.body?.text).trim();
      const sourceLang = readText(req.body?.sourceLang || req.body?.source_lang) || "auto";
      const targetLang = readText(req.body?.targetLang || req.body?.target_lang).trim();

      if (!text) {
        return res.status(400).json({ error: "翻译文本不能为空" });
      }

      if (text.length > MAX_TRANSLATE_LENGTH) {
        return res.status(400).json({ error: `文本长度不能超过 ${MAX_TRANSLATE_LENGTH} 个字符` });
      }

      if (!targetLang) {
        return res.status(400).json({ error: "目标语言不能为空" });
      }

      const result = await translateWithDeepLX({
        text,
        sourceLang,
        targetLang,
      });

      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "DeepLX translation failed",
      });
    }
  }
}
