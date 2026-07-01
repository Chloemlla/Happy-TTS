import type { Request, Response } from "express";
import { getDeepLXConfigSummary, isDeepLXConfigured, translateWithDeepLX } from "../services/deeplxService";
import { TranslationLogService } from "../services/translationLogService";
import { getClientIP } from "../utils/ipUtils";

const MAX_TRANSLATE_LENGTH = 5000;
const PUBLIC_TRANSLATION_USER_ID = "public-api";

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface TranslateOptions {
  publicApi?: boolean;
}

export class DeepLXController {
  public static getConfig(_req: Request, res: Response) {
    res.json(getDeepLXConfigSummary());
  }

  public static async translate(req: Request, res: Response) {
    return DeepLXController.handleTranslate(req, res);
  }

  public static async publicTranslate(req: Request, res: Response) {
    return DeepLXController.handleTranslate(req, res, { publicApi: true });
  }

  private static async handleTranslate(req: Request, res: Response, options: TranslateOptions = {}) {
    try {
      if (!isDeepLXConfigured()) {
        return res.status(503).json({ error: "DeepLX is not configured" });
      }

      const startedAt = Date.now();
      const user = req.user as any;
      const userId = options.publicApi ? PUBLIC_TRANSLATION_USER_ID : user?.id;
      const text = readText(req.body?.text).trim();
      const sourceLang = readText(req.body?.sourceLang || req.body?.source_lang) || "auto";
      const targetLang = readText(req.body?.targetLang || req.body?.target_lang).trim();

      if (!userId) {
        return res.status(401).json({ error: "未认证" });
      }

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

      await TranslationLogService.log({
        userId,
        input_text: text,
        output_text: result.translatedText,
        ip_address: getClientIP(req),
        request_meta: {
          source_lang: result.sourceLang,
          target_lang: result.targetLang,
          alternatives: result.alternatives.slice(0, 6),
          duration_ms: Date.now() - startedAt,
          public_api: Boolean(options.publicApi),
          user_agent: req.headers["user-agent"] || "",
        },
      });

      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      const user = req.user as any;
      const userId = options.publicApi ? PUBLIC_TRANSLATION_USER_ID : user?.id;
      const text = readText(req.body?.text).trim();
      if (userId && text) {
        await TranslationLogService.log({
          userId,
          input_text: text,
          output_text: "",
          ip_address: getClientIP(req),
          request_meta: {
            source_lang: readText(req.body?.sourceLang || req.body?.source_lang) || "auto",
            target_lang: readText(req.body?.targetLang || req.body?.target_lang).trim(),
            error: error instanceof Error ? error.message : "DeepLX translation failed",
            public_api: Boolean(options.publicApi),
            user_agent: req.headers["user-agent"] || "",
          },
        }).catch(() => {});
      }

      return res.status(400).json({
        error: error instanceof Error ? error.message : "DeepLX translation failed",
      });
    }
  }
}
